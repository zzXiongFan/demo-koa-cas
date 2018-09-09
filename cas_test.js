const url = require('url');
const https = require('https');


module.exports = class Cas {
  constructor(options) {
    // 类型错误判断，CAS服务器路径和本地应用路径必须配置
    if (!options || typeof options !== 'object') {
      throw new Error(
        'CAS Authentication was not given a valid configuration object.'
      )
    }
    if (options.cas_url === undefined) {
      throw new Error('CAS Authentication requires a cas_url parameter.')
    }
    if (options.service_url === undefined) {
      throw new Error('CAS Authentication requires a service_url parameter.')
    }

    // 解析配置的地址
    this.cas_url = options.cas_url;
    this.service_url = options.service_url;
    var parsed_cas_url = url.parse(this.cas_url);
    // 在cas类中定义cas的协议类型（http或https）涉及不同类型协议的request请求
    // 学校CAS服务器协议为https，在此处直接定义
    this.cas_server = https;
    this.cas_host = parsed_cas_url.hostname;
    // https协议默认使用443端口
    this.cas_port = 443;
    this.cas_path = parsed_cas_url.pathname;

    // 参考https://apereo.github.io/cas/5.2.x/protocol/CAS-Protocol-V2-Specification.html
    // 上述手册中定义了cas的其他选项，可选，此处没有进行设置

    // session相关信息
    this.session_name = options.session_name !== undefined ? options.session_name : 'cas_user';
    this.session_info = options.session_info !== undefined ? options.session_info : false;

    // 将各方法绑定
    this.bounce = this.bounce.bind(this);
    this.logout = this.logout.bind(this);
  }

  // 定义koa-router调用的方法，命名方式参考其他模块
  // bounce方法提交一个cas认证申请，有_handle方法处理
  async bounce(ctx, next) {
    await _handle.bind(this)(ctx, next, 0);
  }

  logout(ctx, next) {
    // 此处有点问题，在检验完ticket时，应该在服务器本地创建session，本程序中用koa-session插件写在ctx中
    delete ctx.session[this.session_name];
    if (this.session_info) {
      delete ctx.session[this.session_info]
    }

    // Redirect the client to the CAS logout.
    ctx.redirect(this.cas_url + '/logout');
  }
  
}



// _handle方法:
// 验证当前的登陆情况，并按情况进行处理
async function _handle(ctx, next, authType) {
  // 查询是否储存session信息
  if(ctx.session[this.session_name]) {
    // 如果session存在，无需登录，直接进行操作
    await next();
  } else if (ctx.query && ctx.query.ticket) {
    // 无session信息，但有票据信息,进入票据验证_handleTicket方法
    await _checkTicket.bind(this)(ctx, next);
  } else {
    // 所有信息都没有，用户完全没有登陆过，则调用登录_login方法
    await _login.bind(this)(ctx, next);
  }
}


// 登陆方法
// 将页面重定向到cas服务器
function _login(ctx, next) {
  // 记录登陆完成后的重定向目标
  ctx.session.cas_return_to = ctx.query.returnTo || url.parse(ctx.url).path;
  var query = {
    service: this.service_url + url.parse(ctx.url).pathname,
  }
  // 重定向到登录服务器，登录完成后会由CAS服务器将页面重定向回cas_return_to路径，并且包含票据信息
  ctx.redirect(
    this.cas_url +
    url.format({
      pathname: '/login',
      query: query
    })
  )
}

// request方法，登录方法检测到url中带有票据时，向票据检验服务器提出校验申请
const _request = function (requestOptions) {
  return new Promise((resolve, reject) => {
    // 此处调用https协议的requset方法
    // 此处参考node.js手册的request的写法，将request收到的response内容返回
    const request = this.cas_server.request(requestOptions, response => {
      response.setEncoding('utf8')
      var body = ''
      response.on('data', chunk => {
        return (body += chunk)
      })
      response.on('end', _ => {
        resolve(body)
      })
      response.on('error', err => {
        reject(err)
      })
    })

    request.on('error', err => {
      reject(err)
    })
    // 请求结束
    request.end()
  })
}

// 检查票据的方法：_checkTicket
// 方法中调用request方法向CAS服务器请求票据检查
async function _checkTicket(ctx, next) {
  // 创建request选项
  var requestOptions = {
    host: this.cas_host,
    port: this.cas_port
  }

  requestOptions.method = 'GET';
  requestOptions.path = url.format({
    // CAS服务器标准票据检验路径
    pathname: this.cas_path + '/validate',
    // query信息中附带原始路径信息和ticket信息
    query: {
      service: this.service_url + url.parse(ctx.url).pathname,
      ticket: ctx.query.ticket
    }
  })
  
  // 提出request申请
  try {
    const body = await _request.bind(this)(requestOptions);
    var body_ctx = body.split('\n');
    if(body_ctx[0] === 'yes' && body_ctx.length >= 2) {
      // 创建session
      ctx.session[this.session_name] = body_ctx[1];
      ctx.redirect(ctx.session.cas_return_to)
    } else {
      throw(new err('Request error'));
    }
  } catch(err) {
    console.log(err);
    ctx.status = 401;
  }
}




