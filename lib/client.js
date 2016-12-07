const io = require('socket.io-client')
const sodium = require('sodium-encryption')
const nonce = () => sodium.nonce()
const SimplePeer = require('simple-peer')

const defaultHost = 'wss://localhost:9988'

class Tracker {
  constructor (opts) {
    this.publicKey = opts.publicKey
    this.privateKey = opts.privateKey
    this.trackers = opts.trackers || [defaultHost]
    if (!opts.scope) throw new Error('scope is a required option')

    const socket = io(this.trackers[0]) // TODO: support multiple trackers
    socket.emit('subscribe', opts.scope)

    socket.on('offer', (data, nonce, fromKey) => {
      let shared = sodium.scalarMultiplication(this.privateKey, fromKey)
      let decrypted = this.decrypt(data, nonce, shared)
      this.onOffer(decrypted, fromKey)
    })
    socket.on('join-request', (scope, publicKey, parents) => {
      this.onJoinRequest(scope, publicKey, parents)
    })

    this.socket = socket
  }
  send (data, toPublicKey) {
    let _nonce = nonce()
    let encrypted = this.encrypt(data, _nonce, toPublicKey)
    let args = [toPublicKey, encrypted, _nonce, this.publicKey]
    this.socket.emit('send-offer', ...args)
  }
  close () {
    this.socket.close()
  }
  encrypt (data, _nonce, toPublicKey) {
    let shared = sodium.scalarMultiplication(this.privateKey, toPublicKey)
    return sodium.encrypt(new Buffer(JSON.stringify(data)), _nonce, shared)
  }
  decrypt (data, nonce, shared) {
    let message = sodium.decrypt(data, nonce, shared)
    return JSON.parse(message.toString())
  }
}

class CubanLinx {
  constructor (opts) {
    this.opts = opts
    this.keypair = sodium.scalarMultiplicationKeyPair()
    this.tracker = new Tracker(
      { scope: 'test',
        privateKey: this.keypair.secretKey,
        publicKey: this.keypair.publicKey
      }
    )

    /*

    While the terms "incoming" and "outgoing" are used all peers
    are actually bi-directional.

    * Incoming connections are the connections the peer tries to
      maintain to connect itself to the swarm.
    * Outgoing connections are the connections the peer offers to
      propogate the swarm.

    Therefor there must always be a higher threshold for outgoing
    connections than incoming connections in order to maitain the
    health of the swarm.

    */
    this.maxIncoming = opts.maxIncoming || 3
    this.maxOutgoing = opts.maxOutgoing || 6
    // 3 + 6 = 9.
    // 9 members of the Wu-Tang.
    // 9 members x 4 chambers = 36.
    // The 36 Chambers of the Shaolin.
    this.incoming = []
    this.outgoing = []
    this.parents = []
    this.pending = []

    const isParent = parents => {
      for (var i = 0; i < parents.length; i++) {
        if (parents[i].equals(this.keypair.publicKey)) return true
        // TODO: check against my current parent stack
      }
      return false
    }

    this.tracker.onJoinRequest = (scope, publicKey, parents) => {
      if (isParent(parents)) return // This peer receives from me.
      if (this.outgoing.length >= this.maxOutgoing) {
        return // Over connected, don't try to connect.
      }

      // TODO: check all parents in the incoming stacks.

      // TODO: verify pending, incoming and outgoing are not this pubKey.

      var peer = new SimplePeer({ initiator: true, trickle: false })
      peer.on('signal', offer => {
        offer.linxParents = this.parents
        this.tracker.sendOffer(offer, publicKey)
      })
      peer.on('connect', this._onConnect)
      peer.publicKey = publicKey
      this.pending.push(peer)
    }

    const getPending = (publicKey) => {
      for (var i = 0; i < this.pending.length; i++) {
        if (this.pending[i].publicKey.equals(publicKey)) return this.pending[i]
      }
      return null
    }

    this.tracker.onOffer = (data, fromKey) => {
      let pending = getPending(fromKey)
      if (pending) {
        pending.signal(data)
        return
      } else {
        // TODO: non-initiator connections
      }
    }
  }
}

new CubanLinx({scope: 'test'})
