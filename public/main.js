// @ts-check

// const root = document.querySelector('ul');
// function displayMessage(type, message = '') {
//   const li = root.appendChild(document.createElement('li'))
//   li.textContent = `[${type}] ${message}`
// }
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
    connectAsAssistantBtn.disabled = false
    connectAsTraineeBtn.disabled = false
    disconnectBtn.disabled = true
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
  source = undefined;
  role.textContent = '';
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
  | { type: 'waiting-trainees', peers: Peer[] }
  | { type: 'peer-status-change', peer: Peer } // used to update trainee or assistant status in UI.
  | { type: 'assistant-disconnected', assistant: Peer }
  | { type: 'trainee-disconnected', trainee: Peer }
  | { type: 'help-offer', assistant: Peer }
  | { type: 'accept-offer', trainee: Peer }
  | { type: 'help-ended' }
*/

function onMessage(event) {
  const payload = JSON.parse(event.data);
  switch (payload.type) {
    case 'waiting-trainees': return onWaitingTrainees(payload.peers);
    case 'trainee-status-change': return onTraineeStatusChange(payload.trainee);
    case 'assistant-disconnected': return onAssistantDisconnected(payload.assistant);
    case 'trainee-disconnected': return onTraineeDisconnected(payload.trainee);
    case 'help-offer': return onHelpOffer(payload.assistant);
    case 'accept-offer': return onAcceptOffer(payload.trainee);
    case 'reject-offer': return onRejectOffer(payload.trainee);
    case 'help-ended': return onHelpEnded();
    default: throw new Error(`unhandled message: ${payload.type}`)
  }
}

// only as-assistant function
function onWaitingTrainees(trainees) {
  waitingTrainees = trainees;
  renderWaitingTrainees();
}

function onTraineeStatusChange(peer) {
  waitingTrainees.forEach((trainee) => {
    if (trainee.connectionId === peer.connectionId) trainee.status = peer.status;
  });
  renderWaitingTrainees();
}

function onTraineeDisconnected(trainee) {
  console.info('on peer disconnected');
  waitingTrainees = waitingTrainees.filter((waitingTrainee) => waitingTrainee.connectionId !== trainee.connectionId);
  renderWaitingTrainees();
}
function onAssistantDisconnected(assistant) {
  if (assistant.connectionId !== currentAssistant?.connectionId) return;
  disconnect()
  connect('trainee')
}

// only as-trainee function
function onHelpOffer(assistant) {
  const node = document.createElement('div');
  node.textContent = assistant.connectionId + ' offers his/her help, do you accept it? '
  const acceptBtn = node.appendChild(document.createElement('button'));
  acceptBtn.textContent = 'Yes'
  acceptBtn.style.marginRight = '0.5rem'
  acceptBtn.onclick = () => {
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
  const rejectBtn = node.appendChild(document.createElement('button'));
  rejectBtn.textContent = 'No'
  rejectBtn.onclick = () => {
    send({ action: 'reject-help', assistant });
    updateActions(Object.assign(document.createElement('div'), { textContent: 'The help process stops here for the trainee' }));
  };

  updateActions(node);
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

function onRejectOffer(trainee) {
  renderWaitingTrainees();
}

function onHelpEnded() {
  // this function is always executed as trainee.
  disconnect();
}
