// @ts-check

const root = document.querySelector('ul')
const displayMessage = (type, message = '') => {
  const li = rootUl.appendChild(document.createElement('li'))
  li.textContent = `[${type}] ${message}`
}
// const getInput = () => document.querySelector('input')
// const getSendButton = () => document.getElementById('send')
// const getConnectBtn = () => document.getElementById('connect')
// const getDisonnectBtn = () => document.getElementById('disconnect')

// const localPeerConnection = new RTCPeerConnection()
// const sendChannel = localPeerConnection.createDataChannel('IOI-AlgoreaForum')
// localPeerConnection.createOffer().then((of) => {})

// window.connect = function connect() {
//   sendChannel.onopen = () => {}
//   sendChannel.onclose = () => {}

//   /** @type {RTCDataChannel[]} */
//   const receiveChannels = []
//   const remotePeerConnection = new RTCPeerConnection()
//   remotePeerConnection.ondatachannel = (event) => {
//     receiveChannels.push(event.channel)
//     event.channel.onopen = () => {
//       getInput().disabled = false
//       getSendButton().disabled = false
//     }
//     event.channel.onmessage = (event) => {
//       displayMessage('message', event.data)
//     }
//   }

//   localPeerConnection.onicecandidate = (event) => {
//     if (!event.candidate) return
//     remotePeerConnection.addIceCandidate(event.candidate)
//     getConnectBtn().disabled = true
//   }
//   remotePeerConnection.onicecandidate = (event) => {
//     if (!event.candidate) return
//     localPeerConnection.addIceCandidate(event.candidate)
//     getDisonnectBtn().disabled = false
//   }

//   localPeerConnection.createOffer()
//     .then((offer) => localPeerConnection.setLocalDescription(offer))
//     .then(() => remotePeerConnection.setRemoteDescription(localPeerConnection.localDescription))
//     .then(() => remotePeerConnection.createAnswer())
//     .then((answer) => remotePeerConnection.setLocalDescription(answer))
//     .then(() => localPeerConnection.setRemoteDescription(remotePeerConnection.localDescription))
// }

// window.disconnect = function disconnect() {
//   sendChannel.close()
// }

// window.sendMessage = function sendMessage() {
//   const value = getInput().value
//   sendChannel.send(value)
// }


function enable({ sendMessage }) {
  const input = document.querySelector('input');
  const sendButton = document.getElementById('send');
  // const connectBtn = document.getElementById('connect');
  // const disonnectBtn = document.getElementById('disconnect');
  input.disabled = false;
  sendButton.disabled = false;
  sendButton.addEventListener('click', () => {
    if (!input.value) return;
    sendMessage(input.value);
    displayMessage('Me', input.value);
    input.value = '';
  });
}

// main
async function main() {
  document.addEventListener('peermessage', (event) => {
    console.info('[on peer message]', new Date().toISOString());
    displayMessage(event.detail.fromPeerId, event.detail.data);
  })
  // const source = new WebSocket('ws://localhost:3001')
  const source = new WebSocket('ws://upset-worlds-go-77-141-188-209.loca.lt')
  Object.assign(window, { local: { source } })
  let disabled = true
  const manager = new PeerManager(source)
  manager.listen((activePeer, peerId) => {
    console.info('connection established with', peerId);
    if (disabled) {
      enable({
        sendMessage: (data) => {
          manager.getActiveChannels().forEach((channel) => {
            channel.send(data)
          });
        },
      });
      disabled = false;
    }
  })
}

const iceServers = [
  { urls: 'stun:stun.stunprotocol.org:3478' },
  {
    url: 'turn:numb.viagenie.ca',
    credential: 'muazkh',
    username: 'webrtc@live.com'
  },
  // {
  //   url: 'turn:192.158.29.39:3478?transport=udp',
  //   credential: 'JZEOEt2V3Qb0y27GRntt2u2PAYA=',
  //   username: '28224511:1379330808'
  // },
  // {
  //   url: 'turn:192.158.29.39:3478?transport=tcp',
  //   credential: 'JZEOEt2V3Qb0y27GRntt2u2PAYA=',
  //   username: '28224511:1379330808'
  // },
  // { urls: 'stun:stunserver.org:3478' },
  // { urls: 'turn:137.74.113.202:3478', username: 'azfne', credential: 'oegiojre' }, // Thomas Juster's server.
];

/**
 * @typedef {{ connection: RTCPeerConnection, channels: RTCDataChannel[] }} Peer
 */

class PeerManager {
  /**
   * @param {WebSocket} source 
   */
  constructor(source) {
    Object.assign(window, { local: { manager: this, source } })
    /**
     * @type {(message: import('./types').SendMessage) => void}
     */
    this.send = (message) => source.send(JSON.stringify(message));
    source.onmessage = (event) => this.onMessage(JSON.parse(event.data));
    
    /** @type {Map<string, Peer>} */
    this.connections = new Map();

    /** @type {Array<(newActivePeer: Peer, peerId: string) => void>} */
    this.listeners = [];
  }

  /**
   * @param {(newActivePeer: Peer, peerId: string) => void} listener 
   * @returns {() => void} unlisten function
   */
  listen(listener) {
    this.listeners.push(listener)
    return () => {
      this.listeners.splice(this.listeners.indexOf(listener), 1);
    };
  }

  /**
   * @param {Peer} peer 
   * @param {string} peerId
   */
  notifyNewActivePeer(peer, peerId) {
    this.listeners.forEach((listener) => listener(peer, peerId))
  }

  createConnection(peerId) {
    const connection = new RTCPeerConnection({ iceServers });
    const channels = [connection.createDataChannel('chat')];
    const peer = { connection, channels }
    this.connections.set(peerId, peer)
    connection.addEventListener('connectionstatechange', () => {
      if (connection.connectionState === 'connected') this.notifyNewActivePeer(peer, peerId);
    })

    connection.ondatachannel = (event) => {
      event.channel.addEventListener('message', (event) => {
        document.dispatchEvent(new CustomEvent('peermessage', { detail: { data: event.data, fromPeerId: peerId } }))
      })
    }
    connection.onicecandidate = (event) => this.send({
      action: 'forward-ice-candidate',
      toPeerId: peerId,
      iceCandidate: event.candidate,
    });
  }

  /**
   * @param {import('./types').ReceivedMessage} message
   */
  onMessage(message) {
    switch (message.type) {
      case 'peers': return this.onPeers(message)
      case 'offer': return this.onOffer(message)
      case 'answer': return this.onAnswer(message)
      case 'ice-candidate': return this.onIceCandidate(message)
      default:
        throw new Error(`unhandled message type\n${JSON.stringify(message, null, 2)}`)
    }
  }

  /**
   * When connecting to socket backend, the backend sends already connected peers.
   * For each of those peers, we will:
   * - create an rtc peer connection
   * - create an offer
   * - send the offer to the remote peer via the socket backend
   * @param {import('./types').Peers} message
   */
  async onPeers({ peerIds }) {
    console.info('[on peers]', peerIds);
    const promises = peerIds.map(async (peerId) => {
      this.createConnection(peerId);

      const { connection, channels } = this.getPeer(peerId);
      const offer = await connection.createOffer();
      await connection.setLocalDescription(offer);

      this.send({ action: 'forward-offer', toPeerId: peerId, offer })
    });
    return Promise.all(promises);
  }

  /**
   * @param {import('./types').IceCandidate} message
   */
   async onIceCandidate({ fromPeerId, iceCandidate }) {
     console.info('[on ice candidate]', { fromPeerId });
    const { connection } = this.getPeer(fromPeerId);
    await connection.addIceCandidate(new RTCIceCandidate(iceCandidate));
  }

  /**
   * The offer represents a new remote peer trying to connecting with local peer.
   * This means we do not have created an rtc peer connection yet.
   * So we will
   * - create the rtc peer connection
   * - set its answer
   * - send the answer back to the remote peer via the socket backend.
   * @param {import('./types').Offer} message
   */
  async onOffer({ fromPeerId, offer }) {
    console.info('[on offer]', { fromPeerId, offer })
    this.createConnection(fromPeerId);
    const { connection, channels } = this.getPeer(fromPeerId);

    await connection.setRemoteDescription(offer);
    const answer = await connection.createAnswer();
    await connection.setLocalDescription(answer);

    this.send({ action: 'forward-answer', toPeerId: fromPeerId, answer });
  }
  
  /**
   * When the socket backends sends the local peer an answer from a remote peer, we will set it to the rtc peer connection.
   * This should be the final step, the connection with the remote should then be established and backend is not needed anymore.
   * @param {import('./types').Answer} message
   */
  async onAnswer({ fromPeerId, answer }) {
    console.info('[on answer]', { fromPeerId, answer })
    const { connection } = this.getPeer(fromPeerId);
    await connection.setRemoteDescription(answer)
  }

  getPeer(peerId) {
    const rtc = this.connections.get(peerId);
    if (!rtc) throw new Error(`Peer "${peerId}" not found`);
    return rtc
  }

  getActivePeers() {
    // /** @type {RTCPeerConnectionState[]} */
    // const test = ['connected'];
    const entries = Array.from(this.connections.entries()).filter(([, peer]) => peer.connection.connectionState === 'connected')
    return new Map(entries);
  }

  getActiveChannels() {
    const entries = Array.from(this.connections.entries())
      .map(([peerId, peer]) => [
        peerId,
        peer.channels.find((chan) => chan.readyState === 'open'),
      ])
      .filter(([, channel]) => channel);
    return new Map(entries)
  }
}

main()
