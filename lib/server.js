
module.exports = function (io) {
  io.on('connection', socket => {
    socket.on('subscribe', scope => {
      socket.join(`linx:${scope}`)
    })
    socket.on('unsubscribe', scope => {
      socket.leave(`linx:${scope}`)
    })
    socket.on('connect', (scope, publicKey, parents) => {
      socket.join(`pubkey:${publicKey.toString('base64')}`)
      io.to(`linx:${scope}`).emit('join-request', scope, publicKey, parents)
    })
    socket.on('send-offer', (toPublicKey, data, nonce, fromKey) => {
      let pubkey = `pubkey:${toPublicKey.toString('base64')}`
      io.to(pubkey).emit('offer', data, nonce, fromKey)
      socket.join(`pubkey:${fromKey.toString('base64')}`)
    })
  })
  return io
}
