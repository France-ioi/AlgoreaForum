// @ts-check

const connectDiv = document.querySelector('#connect')
const [connectAsAssistantBtn, connectAsTraineeBtn, disconnectBtn] = Array.from(connectDiv.querySelectorAll('button'))
const role = document.querySelector('#role')
const actions = document.querySelector('#actions');
function updateActions(...children) {
  actions.replaceChildren(...children)
}

/** @type {WebSocket} */
let source
let waitingTrainees = []
/** @type {'trainee' | 'assistant'} */
let connectedAs
let currentAssistant

window.addEventListener('beforeunload', () => {
  source?.close();
})

function connect(as) {
  role.textContent = as
  connectedAs = as
  source = new WebSocket(`ws://localhost:3001/?as=${as}`)
  Object.assign(window, { local: { source } })
  source.onmessage = (event) => {
    console.info('[message]', event)
    // displayMessage('message', event.data)
    onMessage(event)
  }
  source.onopen = (event) => {
    console.info('[open]', event)
    // displayMessage('open')
    connectAsAssistantBtn.disabled = true
    connectAsTraineeBtn.disabled = true
    disconnectBtn.disabled = false
  }
  source.onclose = (event) => {
    console.info('[close]', event)
    onClose();
    // displayMessage('close')
  }
  const text = as === 'trainee'
    ? 'Waiting for an assistant to offer help'
    : 'Waiting for a trainee to request help'
  updateActions(Object.assign(document.createElement('div'), { textContent: text }))
}

function disconnect() {
  if (!source) return
  console.info('close source')
  source.close()
}

function onClose() {
  source = undefined;
  role.textContent = '';
  connectAsAssistantBtn.disabled = false
  connectAsTraineeBtn.disabled = false
  disconnectBtn.disabled = true
  updateActions(); // this empties the actions
}

function send(message) {
  if (!source) throw new Error('no source');
  return source.send(JSON.stringify(message));
}

function renderWaitingTrainees() {
  const children = waitingTrainees.map((trainee) => {
    const node = document.createElement('div');
    node.textContent = trainee.connectionId + '  ';
    const offerHelpButton = node.appendChild(document.createElement('button'))
    offerHelpButton.textContent = 'Help'
    const isTraineeBusy = trainee.status === 'TRAINEE_BUSY';
    offerHelpButton.disabled = isTraineeBusy;
    offerHelpButton.onclick = () => {
      send({ action: 'offer-help', trainee });
      updateActions(Object.assign(document.createElement('div'), { textContent: 'Waiting for the answer...' }));
    }
    if (isTraineeBusy) node.appendChild(Object.assign(document.createElement('span'), { textContent: ' (busy)' }))
    return node
  })
  waitingTrainees.length > 0
    ? updateActions(...children)
    : updateActions(Object.assign(document.createElement('div'), { textContent: 'Waiting on trainees to request help' }));
}

/*
export type Message =
  | { type: 'waiting-trainees', trainees: Peer[] }
  | { type: 'assistant-disconnected', assistant: Peer }
  | { type: 'help-offer', assistant: Peer }
  | { type: 'accept-offer', trainee: Peer }
*/

function onMessage(event) {
  const payload = JSON.parse(event.data);
  switch (payload.type) {
    case 'waiting-trainees': return onWaitingTrainees(payload.trainees);
    case 'assistant-disconnected': return onAssistantDisconnected(payload.assistant);
    case 'help-offer': return onHelpOffer(payload.assistant);
    case 'accept-offer': return onAcceptOffer(payload.trainee);
    default: throw new Error(`unhandled message: ${payload.type}`)
  }
}

// only as-assistant function
function onWaitingTrainees(trainees) {
  waitingTrainees = trainees;
  renderWaitingTrainees();
}

function onAssistantDisconnected(assistant) {
  if (assistant.connectionId !== currentAssistant?.connectionId) return;
  disconnect()
  connect('trainee')
}

// only as-trainee function
function onHelpOffer(assistant) {
  currentAssistant = assistant
  send({ action: 'accept-help', assistant });
  const node = document.createElement('div');
  node.textContent = 'Now the help process starts for the trainee '
  const endBtn = node.appendChild(document.createElement('button'))
  endBtn.textContent = 'End help'
  endBtn.onclick = () => {
    send({ action: 'trainee-ends-help', assistant })
    disconnect();
  }
  updateActions(node)
}

function onAcceptOffer(trainee) {
  const node = document.createElement('div');
  node.textContent = 'Help will start now for the assistant '
  const endBtn = node.appendChild(document.createElement('button'))
  endBtn.textContent = 'End help'
  endBtn.onclick = () => {
    send({ action: 'assistant-ends-help', trainee })
  }
  updateActions(node);
}
