# RTC workflow

We'll take the example of 2 clients `Client A` & `Client B` and a `Server`.

For the example, `Client A` will get connected first and `Client B` will join chat.

### NB
- Server-sent messages can be discriminated using `type` key
- Client-sent message can be discriminated using `action` key


### Workflow

- **[Client A]** connects to server websocket
- **[Server]** On **Client A** connection:
  - Send to **Client A** message `{ type: 'connected-peers', peerIds: string[] }`
- **[Client A]** On receive server message `'connected-peers'`, noop since there are no connected peers.
- **[Client B]** connects to server websocket
- **[Server]** On **Client B** connection:
  - Send to **Client B** the message `{ type: 'connected-peers', peerIds: string[] }`, here `peerIds = [A_peerId]`
- **[Client B]** On receive server message `'connected-peers'` (which contains **Client A** peer id):
  - Create one `RTCPeerConnection` per peer id
  - Create one `RTCDataChannel` per peer id (named "chat" or "AlgoreaForum"). This is a channel **Client B** sends messages from
  - Listen to event `'datachannel'`, these are the channels **Client B** receives messages on
  - Listen to event `'icecandidate'` (triggered after creating an offer or answer). When triggered:
    - Send to **Server** message `{ action: 'forward-icecandidate', candidate: RTCIceCandidate, toPeerId: A_peerId }`
  - Create an offer (`rtcPeerConnection.createOffer()`) and set it as local description
  - Send created offer to server `{ action: 'forward-offer', offer: RTCOffer, toPeerId: string }`
- **[Server]** On `{ action: 'forward-icecandidate', candidate: RTCIceCandidate, toPeerId: A_peerId }`:
  - Send to **Client A** message `{ type: 'icecandidate', candidate: RTCIceCandidate, fromPeerId: B_peerId }`
- **[Client]** On `{ type: 'icecandidate', candidate, fromPeerId: RemoteOther_peerId }`:
  - For `RTCPeerConnection` _associated to **RemoteOther**_, add ice candidates
- **[Server]** On `{ action: 'forward-offer, offer: B_offer, toPeerId: A_peerId }`:
  - Send to **Client A** the message `{ type: 'offer', fromPeerId: B_peerId, offer: B_offer }`
- **[Client A]** On `{ type: 'offer', fromPeerId: B_peerId, offer: B_offer }`:
  - Create `RTCPeerConnection`
  - Create one `RTCDataChannel` per peer id (named "chat" or "AlgoreaForum"). This is a channel **Client A** sends messages from
  - Listen to event `'datachannel'`, these are the channels **Client A** receives messages on
  - Set remote connection with **Client B** offer: `connection.setRemoteDescription(socketMessage.offer)`
  - Create an answer: `const answer = await connection.createAnswer()`
  - Set the created answer  as local description: `await connection.setLocalDescription(answer)`
  - Send to **Server** the message `{ action: 'forward-answer', answer, toPeerId: A_peerId }`
- **[Server]** On `{ action: 'forward-answer', answer, toPeerId: A_peerId }`:
  - Send to **Client A** the message `{ type: 'answer', answer, fromPeerId: B_peerId }`
- **[Client A]** On `{ type: 'answer', answer, fromPeerId: B_peerId }`:
  - For `RTCPeerConnection` _associated to **Client B**_, set remote description with answer: `await connection.setRemoteDescription(answer)`

## Implementation

Based on the workflow, we can pseudo code the server and the client.

### Server pseudo-code

Let's consider a basic send function: `send(peerId, body)` for the next pseudo-code.

From a server-side standpoint, the workflow can be summed up by:
- On **Client A** connection:
  - Send to **Client A** message `{ type: 'connected-peers', peerIds: string[] }`
- On **Client B** message `{ action: 'forward-offer, offer: B_offer, toPeerId: A_peerId }`:
  - Send to **Client A** the message `{ type: 'offer', fromPeerId: B_peerId, offer: B_offer }`
- On **Client B** message `{ action: 'forward-icecandidate', candidate: RTCIceCandidate, toPeerId: A_peerId }`:
  - Send to **Client A** message `{ type: 'icecandidate', candidate: RTCIceCandidate, fromPeerId: B_peerId }`
- On **Client B** message `{ action: 'forward-answer', answer, toPeerId: A_peerId }`:
  - Send to **Client A** the message `{ type: 'answer', answer, fromPeerId: B_peerId }`

<details>
<summary>Pseudo code</summary>

##### On connection, send connected peers

```js
export const connectionHandler = async (event) => {
  const newPeerId = getPeerId(event);
  const peerIds = await dynamodb.scan({ ... }).promise();
  await dynamodb.put({ ... }).promise();
  await send(newPeerId, { type: 'connected-peers', peerIds })

  return { statusCode: 204, body: null };
}
```

##### On disconnection, remove peer from db

```js
export const disconnectionHandler = async (event) => {
  const peerId = getPeerId(event);
  await dynamodb.delete({ ... }).promise();

  return { statusCode: 204 };
};
```

##### On forward offer, forward offer

```js
export const forwardOffer = async (event) => {
  const { offer, toPeerId } = getPayload(event); // get payload from event
  const fromPeerId = getPeerId(event); // get peer id from event
  await assertPeerIsConnected(toPeerId)

  await send(toPeerId, { type: 'offer', offer, fromPeerId })

  return { statusCode: 204, body: null };
}
```

##### On forward answer, forward answer

```js
export const forwardAnswer = async (event) => {
  const { answer, toPeerId } = getPayload(event);
  const fromPeerId = getPeerId(event);
  await assertPeerIsConnected(toPeerId);

  await send(toPeerId, { type: 'answer', answer, fromPeerId })

  return { statusCode: 204 }
};
```

##### On forward ice candidate, forward ice candidate

```js
export const forwardIceCandidate = async (event) => {
  const { candidate, toPeerId } = getPayload(event);
  const fromPeerId = getPeerId(event);
  await assertPeerIsConnected(toPeerId);

  await send(toPeerId, { type: 'icecandidate', candidate, fromPeerId });

  return { statusCode: 204 };
};
```

</details>

### Client pseudo-code

From a client-side standpoint, the full connection workflow can be summed up by:
- Connect to server websocket
- On receive server message `'connected-peers'`:
  - Create an RTC peer connection and listen to adequate events
  - Create an offer (`rtcPeerConnection.createOffer()`) and set it as local description
  - Send created offer to server `{ action: 'forward-offer', offer: RTCOffer, toPeerId: string }`
- On `{ type: 'offer', fromPeerId: RemoteOther_peerId, offer: RemoteOther_offer }`:
  - Create an RTC peer connection and listen to adequate events
  - Set remote connection with **RemoteOther** offer: `connection.setRemoteDescription(socketMessage.offer)`
  - Create an answer: `const answer = await connection.createAnswer()`
  - Set the created answer  as local description: `await connection.setLocalDescription(answer)`
  - Send to **Server** the message `{ action: 'forward-answer', answer, toPeerId: RemoteOther_peerId }`
- On `{ type: 'answer', answer, fromPeerId: RemoteOther_peerId }`:
  - For `RTCPeerConnection` _associated to **RemoteOther**_, set remote description with answer: `await connection.setRemoteDescription(answer)`
- On `{ type: 'icecandidate', candidate, fromPeerId: RemoteOther_peerId }`:
  - For `RTCPeerConnection` _associated to **RemoteOther**_, add ice candidates


An RTC peer connection **creation** (per peer id) can be summed up by:
- Instantiate `RTCPeerConnection`
- Instantiate an `RTCDataChannel` named "chat" or "AlgoreaForum". This is a channel **LocalPeer** sends messages from
- Listen to event `'datachannel'`, these are the channels **LocalPeer** receives messages from
- Listen to event `'icecandidate'` (triggered after creating an offer or answer). When triggered:
  - Send to **Server** message `{ action: 'forward-icecandidate', candidate: RTCIceCandidate, toPeerId: A_peerId }`

## How to test

Requirements:
- Project downloaded and installed (`npm ci`)
- `localtunnel` installed globally (`npm i -g localtunnel`)

First, forward local ports using:
- In tab 1: `lt --port 3000 --print-requests` - exposes public site via public url
- In tab 2: `lt --port 3001 --print-requests` - exposes sockets via public url

Then:
- update `main.js` websocket source with url from tab 1
- In tab 3: `npm start`

And finally:
- Have one peer connect to url from tab 1 **with http NOT httpS**
- Have another peer connect at same url (from another network)
