// /** @typedef {{ action: 'forward-offer', toPeerId: string, offer: RTCSessionDescriptionInit }} ForwardOffer */
// /** @typedef {{ action: 'forward-answer', toPeerId: string, answer: RTCSessionDescriptionInit }} ForwardAnswer */
// /** @typedef {{ action: 'forward-ice-candidate', toPeerId: string, iceCandidate: RTCIceCandidate }} ForwardIceCandidate */
// /** @typedef {ForwardOffer | ForwardAnswer | ForwardIceCandidate} SendableMessage */

// /** @typedef {{ type: 'peers', peerIds: string[] }} Peers */
// /** @typedef {{ type: 'offer', fromPeerId: string, offer: RTCSessionDescriptionInit }} Offer */
// /** @typedef {{ type: 'answer', fromPeerId: string, answer: RTCSessionDescriptionInit }} Answer */
// /** @typedef {{ type: 'ice-candidate', fromPeerId: string, offer: RTCIceCandidate }} IceCandidate */
// /** @typedef {Peers | Offer | Answer | IceCandidate} ReceivedMessage */

export type ForwardOffer = { action: 'forward-offer', toPeerId: string, offer: RTCSessionDescriptionInit }
export type ForwardAnswer = { action: 'forward-answer', toPeerId: string, answer: RTCSessionDescriptionInit }
export type ForwardIceCandidate = { action: 'forward-ice-candidate', toPeerId: string, iceCandidate: RTCIceCandidate }
export type SendMessage = ForwardOffer | ForwardAnswer | ForwardIceCandidate

export type Peers = { type: 'peers', peerIds: string[] }
export type Offer = { type: 'offer', fromPeerId: string, offer: RTCSessionDescriptionInit }
export type Answer = { type: 'answer', fromPeerId: string, answer: RTCSessionDescriptionInit }
export type IceCandidate = { type: 'ice-candidate', fromPeerId: string, iceCandidate: RTCIceCandidate }
export type ReceivedMessage = Peers | Offer | Answer | IceCandidate

export {}