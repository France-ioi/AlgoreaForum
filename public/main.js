// @ts-check

const root = document.querySelector('ul')
const displayMessage = (type, message = '') => {
  const li = root.appendChild(document.createElement('li'))
  li.textContent = `[${type}] ${message}`
}
const getInput = () => document.querySelector('input')
const getSendButton = () => document.getElementById('send')
const getConnectBtn = () => document.getElementById('connect')
const getDisonnectBtn = () => document.getElementById('disconnect')

const localPeerConnection = new RTCPeerConnection()
const sendChannel = localPeerConnection.createDataChannel('IOI-AlgoreaForum')

window.connect = function connect() {
  sendChannel.onopen = () => {}
  sendChannel.onclose = () => {}

  /** @type {RTCDataChannel[]} */
  const receiveChannels = []
  const remotePeerConnection = new RTCPeerConnection()
  remotePeerConnection.ondatachannel = (event) => {
    receiveChannels.push(event.channel)
    event.channel.onopen = () => {
      getInput().disabled = false
      getSendButton().disabled = false
    }
    event.channel.onmessage = (event) => {
      displayMessage('message', event.data)
    }
  }

  localPeerConnection.onicecandidate = (event) => {
    if (!event.candidate) return
    remotePeerConnection.addIceCandidate(event.candidate)
    getConnectBtn().disabled = true
  }
  remotePeerConnection.onicecandidate = (event) => {
    if (!event.candidate) return
    localPeerConnection.addIceCandidate(event.candidate)
    getDisonnectBtn().disabled = false
  }

  localPeerConnection.createOffer()
    .then((offer) => localPeerConnection.setLocalDescription(offer))
    .then(() => remotePeerConnection.setRemoteDescription(localPeerConnection.localDescription))
    .then(() => remotePeerConnection.createAnswer())
    .then((answer) => remotePeerConnection.setLocalDescription(answer))
    .then(() => localPeerConnection.setRemoteDescription(remotePeerConnection.localDescription))
}

window.disconnect = function disconnect() {
  sendChannel.close()
}

window.sendMessage = function sendMessage() {
  const value = getInput().value
  sendChannel.send(value)
}

// main
;(async () => {
  const source = new WebSocket('ws://localhost:3001')
  Object.assign(window, { local: { source } })
  source.onopen = (event) => {
    console.info('open', event)
    displayMessage('open')
    source.send(JSON.stringify({ action: 'answer-to-offer', message: 'Test!' }))
  }
  source.onerror = (event) => {
    console.info('error', event)
    displayMessage('error', '...')
    source.close()
  }
  source.onmessage = (event) => {
    console.info('message', event)
    displayMessage('message', event.data)
  }
  source.onclose = (event) => {
    displayMessage('close')
  }
})();
