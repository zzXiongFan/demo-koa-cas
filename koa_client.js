const Koa = require('koa')
const Router = require('koa-router')
const Session = require('koa-session')
const Cas = require('./cas_test.js')

app = new Koa();
// Set up an Koa session, which is required for CASAuthentication.
app.keys = ['some secret hurr']
app.use(Session(app))

// Create a new instance of CASAuthentication.
const cas = new Cas({
  cas_url: 'https://cas.xjtu.edu.cn',
  service_url: 'http://localhost:3000'
})

const router = Router()

// Unauthenticated clients will be redirected to the CAS login and then back to
// this route once authenticated.
router.get('/', cas.bounce, ctx => {
  ctx.body = {
    cas_user: ctx.session[cas.session_name]
  }
})


// This route will de-authenticate the client with the Koa server and then
// redirect the client to the CAS logout page.
router.get('/logout', cas.logout)

app.use(router.routes())

app.listen(3000, _ => {
  console.log('listening on port 3000')
})