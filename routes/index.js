var express = require('express');
var router = express.Router();
var crypto = require('crypto');
var User = require('../models/user');
var Post = require('../models/post');
var showdown = require('showdown');//处理markdown所需模块
var nodemailer = require('nodemailer');
var setting = require('../setting');

var mailTransport = nodemailer.createTransport('SMTP', {
	host: "smtp.qq.com",        // 主机
  secureConnection : true,    // 使用 SSL
  port: 465,                  // SMTP 端口
  auth: {
    user: setting.qqmail.user,
    pass: setting.qqmail.password
  }
});
//首页请求处理
router.get('/', function(req, res) {
  //读取所有的用户微博，传递把posts微博数据集传给首页
  Post.get(null, function (err, posts) {
    if (err) {
        posts = [];
    }
    //调用模板引擎，并传递参数给模板引擎
    res.render('index', {title: '首页', posts: posts});
  });
});

//注册请求处理
router.get('/reg', function(req, res) {
	res.render('reg', {title: '用户注册'})
});

router.post('/reg', function(req, res) {
	//简单的表单验证,后续再增强
	if (req.body.username === '' || req.body.account === '' || req.body.password === '') {
		req.flash('error', '输入框不能为空');
		return res.redirect('/reg');
	}
	//密码加密,MD5并不安全，后续再换
	var md5 = crypto.createHash('md5');
	var password = md5.update(req.body.password).digest('base64');
	//实例化user对象
	var newUser = new User({
		account: req.body.account,
		name: req.body.username,
		password: password,
		active: 0,
		activeWord: Math.floor((Math.random() * 1000000)),
		followings: 0,
		followers: 0,
		posts: 0,
		words: 0,
		goods: 0
	});
	//生成验证邮箱链接
	var activeLink = 'localhost\:2000/confirm/' + newUser.name + '/' + newUser.activeWord; 
	//检测用户是否存在
	User.get(newUser.account, newUser.name, function(err, user) {
		if (user) {
			//用户存在，这里后续可以增强是邮箱存在还是用户名存在
      err = '用户已存在';
    }
    if (err) {
    	//保存错误信息，用于界面显示提示
      req.flash('error', err);
      return res.redirect('/reg');
    }

    newUser.save(function (err) {
    	//用户名不存在时，保存记录到数据库
      if (err) {
          req.flash('error', err);
          return res.redirect('/reg');
      }
      
      mailTransport.sendMail({
      	from: '1312533774@qq.com',
      	to: newUser.account,
      	subject: '欢迎注册Xblog',
      	html: '<h1>点击下方链接完成验证</h1><a href="' + activeLink + '">' + activeLink + '</a>'
      }, function(err) {
      	if (err) {
      		console.log(err);
      	}
      });
      req.flash('success', '请查收验证邮件,没有的话请检查垃圾箱');
      return res.redirect('/login');     
    });
	});
});

//验证邮箱
router.get('/confirm/:user/:word', function(req, res) {
	User.get(req.params.user, function(err, user) {
		if (!user) {
			return res.redirect('/');
		}
		//req.params.word是number类型
		if (user.activeWord == req.params.word) {
			user.active = 1;
			
			user.update(function(err) {
				if (err) {
			    req.flash('error', err);
			    return res.redirect('/');    
			  }	else {
			  	req.flash('success', '邮箱验证成功');
					return res.redirect('/login');
			  }
			});			
		} 
	});
});

//登录请求处理
router.get('/login', checkNotLogin);
router.get('/login', function(req, res) {
	res.render('login', {title: '用户登录'});
});

router.post('/login', function(req, res) {
	//简单的表单验证,后续再增强
	if (req.body.account === '' || req.body.password === '') {
		req.flash('error', '输入框不能为空');
		return res.redirect('/login');
	}
	//密码加密后得到要验证的密码
	var md5 = crypto.createHash('md5');
	var password = md5.update(req.body.password).digest('base64');
	//检查数据库是否有该用户
	User.get(req.body.account, function(err, user) {
		if (!user) {
			req.flash('error', '用户不存在');
			return res.redirect('/login');
		}
		if (!user.active) {
			req.flash('error', '未验证邮箱');
			return res.redirect('/login');
		}
		console.log(password);
		console.log(user.password);
		if (user.password === password) {
			req.flash('success', '登录成功');
			//使用session记录当前登录用户
			req.session.user = user;
			return res.redirect('/');
		} else {
			req.flash('error', '账号密码不匹配');
			return res.redirect('/login');
		}
	});	
});

//忘记密码请求处理
router.get('/forget', checkNotLogin);
router.get('/forget', function(req, res) {
	res.render('forget', {title: '忘记密码'});
});

router.post('/forget', function(req, res) {
	//简单的表单验证,后续再增强
	if (req.body.account === '' || req.body.password === '' || req.body.repeatpsw === '') {
		req.flash('error', '输入框不能为空');
		return res.redirect('/forget');
	}
	if (req.body.password !== req.body.repeatpsw) {
		req.flash('error', '两次输入密码不一致');
		return res.redirect('/forget');
	}
	//检测是否存在该邮箱账号
	User.get(req.body.account, function(err, user) {
		//密码加密后得到要更改的新密码
		var md5 = crypto.createHash('md5');
		var password = md5.update(req.body.password).digest('base64');
		//将用户账号和新密码生成链接,这里应该仍使用注册时的验证码
		var newpswLink = 'localhost\:2000/newpsw/' + user.name + '/' + user.activeWord + '/' + password;
		if (!user) {
			req.flash('error', '无此邮箱账号');
			return res.redirect('/forget');
		}
		//存在账号则发送邮件
		mailTransport.sendMail({
      	from: '1312533774@qq.com',
      	to: req.body.account,
      	subject: '忘记密码Xblog',
      	html: '<h1>点击下方链接完成更改密码</h1><a href="' + newpswLink + '">' + newpswLink + '</a>'
      }, function(err) {
      	if (err) {
      		console.log(err);
      	}
    });
    req.flash('success', '请验证邮件以完成密码重置,未收到请检查垃圾箱');
    return res.redirect('/login');      
	});
});

//处理来自更改密码邮件的链接请求
router.get('/newpsw/:user/:word/:password', function(req, res) {
	//由链接中的用户名来查找账户
	User.get(req.params.user, function(err, user) {
		if (!user) {
			req.flash('error', '用户不存在');
			return res.redirect('/');
		}
		if (req.params.word == user.activeWord && req.params.password !== '') {
			//验证activeWord并更改密码
			user.password = '' + req.params.password;
			//更新数据库用户信息
			user.update(function(err) {
				if (err) {
			    req.flash('error', err);
			    return res.redirect('/');    
			  }	else {
			  	req.flash('success', '密码重置成功');
					return res.redirect('/login');
			  }
			});			
		}
	})
});

//用户主页请求处理
router.get('/u/:user', checkLogin);
router.get('/u/:user', function(req, res) {
	//根据请求中的参数获取user
	User.get(req.params.user, function(err, user) {
		if (!user) {
			req.flash('error', '用户不存在');
			return res.redirect('/');
		}
		//用户存在则根据用户名获取其posts
		Post.get(user.name, function(err, posts) {
			if (err) {
				req.flash('error', err);
        return res.redirect('/');
			}
			//根据获取的posts来生成用户主页
			res.render('user', {title: '个人主页', posts: posts});
		});		
	});
});

//用户写文章请求处理,富文本编辑器
router.get('/writehtml', checkLogin);
router.get('/writehtml', function(req, res) {
  res.render('writehtml', { title: '写文章' });
});

router.post('/posthtml', function(req, res) {
	//获取发表文章用户
	var user = new User(req.session.user);
	//实例化要存入数据库的文章
	var post = new Post(user.name, req.body.title, req.body.content);
	//保存文章
	post.save(function(err) {
		if (err) {
	    req.flash('error', err);
	    return res.redirect('/');    
	  }	
	});
	//用户发表文章数,字数增加
	user.posts += 1;
  user.words += post.words;
  //更新session.user
 	req.session.user = user;
 	//更新数据库中的user
  user.update(function(err) {
  	if (err) {
  		console.log('qwewqe');
      req.flash('error', err);
    }
    req.flash('success', '发表成功');
    return res.redirect('/u/' + user.name);
  });
});

//用户写文章请求处理,markdown编辑器,显示文章详情时支持不好
//不能自动换行,后续再完善
router.get('/writemd', checkLogin);
router.get('/writemd', function(req, res) {
  res.render('writemd', { title: '写文章' });
});

router.post('/postmd', function(req, res) {
	//获取发表文章用户
	var user = req.session.user;
	//将markdown解析成html
	var converter = new showdown.Converter();
	var mdContent = req.body.content;
	var htmlContent = converter.makeHtml(mdContent);
	//实例化要存入数据库的文章
	var post = new Post(user.name, req.body.title, htmlContent);
	//保存文章
	post.save(function(err) {
		if (err) {
	    req.flash('error', err);
	    return res.redirect('/');    
	  }	
	});
	//用户发表文章数,字数增加
	user.posts += 1;
  user.words += post.words;
  //更新session.user
 	req.session.user = user;
 	//更新数据库中的user
  user.update(function(err) {
  	if (err) {
      req.flash('error', err);
    }
    req.flash('success', '发表成功');
    return res.redirect('/u/' + user.name);
  });
});

router.get('/p/:id', function(req, res) {
	//使用_id来查询post
	Post.search(req.params.id, function(err, post) {
		if (err) {
			req.flash('error', err);
			return res.redirect('/');
		}	
		res.render('postdetail', {title: '文章详情', post: post});
	});
});

//登出请求处理
router.get('/logout', checkLogin);
router.get('/logout', function(req, res) {
	//将session中用户清除
	req.session.user = null;
	req.flash('success', '退出成功');
	res.redirect('/');
});

//检测是否登录
function checkLogin(req, res, next) {
	if (!req.session.user) {
		req.flash('error', '未登入');
		return res.redirect('/login');
	}
	next();
}
function checkNotLogin(req, res, next) {
	if (req.session.user) {
		req.flash('error', '已登入');
		return res.redirect('/');
	}
	next();
}
//导出router模块
module.exports = router;
