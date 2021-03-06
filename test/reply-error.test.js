'use strict'

const t = require('tap')
const test = t.test
const net = require('net')
const Fastify = require('..')
const statusCodes = require('http').STATUS_CODES

const codes = Object.keys(statusCodes)
codes.forEach(code => {
  if (Number(code) >= 400) helper(code)
})

function helper (code) {
  test('Reply error handling - code: ' + code, t => {
    t.plan(3)
    const fastify = Fastify()
    const err = new Error('winter is coming')

    fastify.get('/', (req, reply) => {
      reply
        .code(Number(code))
        .send(err)
    })

    fastify.inject({
      method: 'GET',
      url: '/'
    }, res => {
      t.strictEqual(res.statusCode, Number(code))
      t.equal(res.headers['content-type'], 'application/json')
      t.deepEqual(
        {
          error: statusCodes[code],
          message: err.message,
          statusCode: Number(code)
        },
        JSON.parse(res.payload)
      )
    })
  })
}

test('preHandler hook error handling with external code', t => {
  t.plan(2)
  const fastify = Fastify()
  const err = new Error('winter is coming')

  fastify.addHook('preHandler', (req, reply, done) => {
    reply.code(400)
    done(err)
  })

  fastify.get('/', () => {})

  fastify.inject({
    method: 'GET',
    url: '/'
  }, res => {
    t.strictEqual(res.statusCode, 400)
    t.deepEqual(
      {
        error: statusCodes['400'],
        message: err.message,
        statusCode: 400
      },
      JSON.parse(res.payload)
    )
  })
})

test('onRequest hook error handling with external done', t => {
  t.plan(2)
  const fastify = Fastify()
  const err = new Error('winter is coming')

  fastify.addHook('onRequest', (req, res, done) => {
    res.statusCode = 400
    done(err)
  })

  fastify.get('/', () => {})

  fastify.inject({
    method: 'GET',
    url: '/'
  }, res => {
    t.strictEqual(res.statusCode, 400)
    t.deepEqual(
      {
        error: statusCodes['400'],
        message: err.message,
        statusCode: 400
      },
      JSON.parse(res.payload)
    )
  })
})

if (Number(process.versions.node[0]) >= 6) {
  test('Should reply 400 on client error', t => {
    t.plan(2)

    const fastify = Fastify()
    fastify.listen(0, err => {
      t.error(err)

      const client = net.connect(fastify.server.address().port)
      client.end('oooops!')

      var chunks = ''
      client.on('data', chunk => {
        chunks += chunk
      })

      client.once('end', () => {
        const body = JSON.stringify({
          error: 'Bad Request',
          message: 'Client Error',
          statusCode: 400
        })
        t.equal(`HTTP/1.1 400 Bad Request\r\nContent-Length: ${body.length}\r\nContent-Type: 'application/json'\r\n\r\n${body}`, chunks)
        fastify.close()
      })
    })
  })
}

test('Error instance sets HTTP status code', t => {
  t.plan(2)
  const fastify = Fastify()
  const err = new Error('winter is coming')
  err.statusCode = 418

  fastify.get('/', () => {
    return Promise.reject(err)
  })

  fastify.inject({
    method: 'GET',
    url: '/'
  }, res => {
    t.strictEqual(res.statusCode, 418)
    t.deepEqual(
      {
        error: statusCodes['418'],
        message: err.message,
        statusCode: 418
      },
      JSON.parse(res.payload)
    )
  })
})

test('Error status code below 400 defaults to 500', t => {
  t.plan(2)
  const fastify = Fastify()
  const err = new Error('winter is coming')
  err.statusCode = 399

  fastify.get('/', () => {
    return Promise.reject(err)
  })

  fastify.inject({
    method: 'GET',
    url: '/'
  }, res => {
    t.strictEqual(res.statusCode, 500)
    t.deepEqual(
      {
        error: statusCodes['500'],
        message: err.message,
        statusCode: 500
      },
      JSON.parse(res.payload)
    )
  })
})

test('Error.status property support', t => {
  t.plan(2)
  const fastify = Fastify()
  const err = new Error('winter is coming')
  err.status = 418

  fastify.get('/', () => {
    return Promise.reject(err)
  })

  fastify.inject({
    method: 'GET',
    url: '/'
  }, res => {
    t.strictEqual(res.statusCode, 418)
    t.deepEqual(
      {
        error: statusCodes['418'],
        message: err.message,
        statusCode: 418
      },
      JSON.parse(res.payload)
    )
  })
})

test('invalid schema - ajv', t => {
  t.plan(3)

  const fastify = Fastify()
  fastify.get('/', {
    schema: {
      querystring: {
        type: 'object',
        properties: {
          id: { type: 'number' }
        }
      }
    }
  }, (req, reply) => {
    t.fail('we should not be here')
  })

  fastify.setErrorHandler((err, reply) => {
    t.ok(Array.isArray(err.validation))
    reply.send('error')
  })

  fastify.inject({
    url: '/?id=abc',
    method: 'GET'
  }, res => {
    t.strictEqual(res.statusCode, 400)
    t.strictEqual(res.payload, 'error')
  })
})

test('should set the status code and the headers from the error object (from route handler)', t => {
  t.plan(3)
  const fastify = Fastify()

  fastify.get('/', (req, reply) => {
    const error = new Error('kaboom')
    error.headers = { hello: 'world' }
    error.statusCode = 400
    reply.send(error)
  })

  fastify.inject({
    url: '/',
    method: 'GET'
  }, res => {
    t.strictEqual(res.statusCode, 400)
    t.strictEqual(res.headers.hello, 'world')
    t.deepEqual(JSON.parse(res.payload), {
      error: 'Bad Request',
      message: 'kaboom',
      statusCode: 400
    })
  })
})

test('should set the status code and the headers from the error object (from custom error handler)', t => {
  t.plan(5)
  const fastify = Fastify()

  fastify.get('/', (req, reply) => {
    const error = new Error('ouch')
    error.statusCode = 401
    reply.send(error)
  })

  fastify.setErrorHandler((err, reply) => {
    t.is(err.message, 'ouch')
    t.is(reply.res.statusCode, 401)
    const error = new Error('kaboom')
    error.headers = { hello: 'world' }
    error.statusCode = 400
    reply.send(error)
  })

  fastify.inject({
    url: '/',
    method: 'GET'
  }, res => {
    t.strictEqual(res.statusCode, 400)
    t.strictEqual(res.headers.hello, 'world')
    t.deepEqual(JSON.parse(res.payload), {
      error: 'Bad Request',
      message: 'kaboom',
      statusCode: 400
    })
  })
})

test('Should throw when non-error value is used to reject a promise', t => {
  t.plan(3)

  // Tap patched this event and we have no chance to listen on it.
  const listeners = process.listeners('unhandledRejection')
  process.removeAllListeners('unhandledRejection')

  process.once('unhandledRejection', (err) => {
    t.type(err, TypeError)
    t.strictEqual(err.message, "Attempted to reject a promise with a non-error value from type 'string'")
    t.strictEqual(err.cause, 'string')
    process.addListener.apply(process, ['unhandledRejection'].concat(listeners))
  })

  const fastify = Fastify()

  const noneError = 'string'
  fastify.get('/', () => {
    return Promise.reject(noneError)
  })

  fastify.inject({
    method: 'GET',
    url: '/'
  }, res => {
    t.fail('should not be called')
  })
})

// Issue 595 https://github.com/fastify/fastify/issues/595
test('\'*\' should throw an error due to serializer can not handle the payload type', t => {
  t.plan(2)
  const fastify = Fastify()

  fastify.get('/', (req, reply) => {
    reply.type('text/html')
    try {
      reply.send({})
    } catch (err) {
      t.type(err, TypeError)
      t.strictEqual(err.message, "Attempted to send payload of invalid type 'object' without serialization. Expected a string or Buffer.")
    }
  })

  fastify.inject({
    url: '/',
    method: 'GET'
  }, res => {
    t.fail('should not be called')
  })
})

test('should throw an error due to custom serializer can not handle the payload type', t => {
  t.plan(2)
  const fastify = Fastify()

  fastify.get('/', (req, reply) => {
    try {
      reply
      .type('text/html')
      .serializer(payload => payload)
      .send({})
    } catch (err) {
      t.type(err, TypeError)
      t.strictEqual(err.message, "Serializer for Content-Type 'text/html' returned invalid payload of type 'object'. Expected a string or Buffer.")
    }
  })

  fastify.inject({
    url: '/',
    method: 'GET'
  }, res => {
    t.fail('should not be called')
  })
})
