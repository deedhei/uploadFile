/**
 * 服务入口
 */
var http = require("http");
var koaStatic = require("koa-static");
var path = require("path");
var { koaBody } = require("koa-body");
const cors = require("koa2-cors"); // 允许跨域
const fse = require("fs-extra");
var fs = require("fs");
var Koa = require("koa2");
const Router = require("koa-router");

var app = new Koa();
const router = new Router();
var port = process.env.PORT || "8100";

var uploadHost = `http://localhost:${port}/static/`;
console.log("[Log] uploadHost-->", uploadHost);
app.use(
  cors({
    origin: function (ctx) {
      //设置允许来自指定域名请求
      if (ctx.url === "/test") {
        return "*"; // 允许来自所有域名请求
      }
      return "http://localhost:8080"; //只允许http://localhost:8080这个域名的请求
    },
    maxAge: 5, //指定本次预检请求的有效期，单位为秒。
    credentials: true, //是否允许发送Cookie
    allowMethods: ["GET", "POST", "PUT", "DELETE", "OPTIONS"], //设置所允许的HTTP请求方法'
    allowHeaders: ["Content-Type", "Authorization", "Accept"], //设置服务器支持的所有头信息字段
    exposeHeaders: ["WWW-Authenticate", "Server-Authorization"], //设置获取其他自定义字段
  })
);

app.use(
  koaBody({
    formidable: {
      //设置文件的默认保存目录，不设置则保存在系统临时目录下  os
      uploadDir: path.resolve(__dirname, "./static"),
    },
    multipart: true, // 支持文件上传
  })
);

//开启静态文件访问
app.use(koaStatic(path.resolve(__dirname, "./static")));

// 上传文件的目录地址
const UPLOAD_DIR = path.resolve(__dirname, "./static");
//用于存储已经上传完的文件名，用于判断是否全部已经上传完成
let fileObj = {};
let startTime = null;
let isStart = true;
router.post("/bigFile", async (ctx, next) => {
  if (isStart) {
    startTime = new Date().getTime();
    isStart = false;
    console.log("[Log] startTime-->", startTime);
  }
  //设置请求过期时间
  ctx.request.socket.setTimeout(6 * 3600);

  // 文件转移
  // koa-body 在处理完 file 后会绑定在 ctx.request.files
  const file = ctx.request.files.file;
  const body = ctx.request.body;
  // console.log("[Log] ctx.request.body.hash-->", ctx.request.body.hash);

  const fileNameArr = ctx.request.body.hash.split("."); // [朱兴-web前端开发.pdf_50]
  //获取当前是第几份切片
  const lastIndex = fileNameArr[1].split("_")[1]; //[pdf,50]
  // 存放切片的目录
  const chunkDir = `${UPLOAD_DIR}/${fileNameArr[0]}`;

  if (!fse.existsSync(chunkDir)) {
    // 没有目录就创建目录
    // 创建大文件的临时目录
    await fse.mkdirs(chunkDir);
  }

  //读取当前文件夹的所有文件，以此用来判断切片是否已经全部上传完成,如果当前切片已经上传完成则不操作并返回说明
  const files = await fse.readdirSync(chunkDir);
  // console.log("当前目录所有文件", files, chunkDir);

  // 原文件名.index - 每个分片的具体地址和名字
  //   console.log('chunkDir',chunkDir)
  //   console.log('fileNameArr',fileNameArr)
  const dPath = path.join(chunkDir, fileNameArr[1]);

  // 将分片文件从 bigFile 中移动到本次上传大文件的临时目录
  //move(src,dest,options,callback)
  /**
   * src:它是一个字符串，其中包含要移动的文件的路径(源路径)。
   * dest:它是一个字符串，其中包含文件将被移动到的路径(目标路径)。
   * options:这是一个对象，其属性覆盖可以为true或false。默认情况下，为：false。如果将其设置为true，则如果目标文件夹中存在具有相同名称的文件，则该文件将被覆盖。
   * callback:当执行了move()函数时，将调用该函数。这将导致错误或成功。这是一个可选参数，我们也可以使用promise代替回调函数。
   */
  await fse.moveSync(file.filepath, dPath, { overwrite: true });

  // { hash: '朱兴-web前端开发.pdf_50', filename: '朱兴-web前端开发.pdf', total: '51' }
  //检测该对象里面是否包含对应的文件名的数组，检测里面的分切是否重复，没有则放进数组，给后面根据数组长度来判断是否已全部上传
  if (Array.isArray(fileObj[body.filename])) {
    fileObj[body.filename].indexOf(body.hash) !== -1
      ? null
      : fileObj[body.filename].push(body.hash);
  } else {
    fileObj[body.filename] = [];
    fileObj[body.filename].push(body.hash);
  }

  if (body.total == fileObj[body.filename].length) {
    ctx.body = { msg: "切片全部上传完成", code: 200 };
  } else {
    ctx.body = { msg: `切片${body.hash}上传完成`, code: 201, data: body.hash };
  }
});

router.post("/isExitFile", async (ctx, next) => {
  //设置请求过期时间
  ctx.request.socket.setTimeout(6 * 3600);
  console.log("[Log] ctx.request.body-->", ctx.request.body);
  const fileNameArr = ctx.request.body.hash; // [朱兴-web前端开发.pdf_50]
  let fileName = `${UPLOAD_DIR}/${fileNameArr}`;
  // E:\Users\赤子\Desktop\前端\前端面试\大文件上传\koa\static/9d76b87b135ee38e317bdf27db500843
  console.log("[Log] fileName-->", fileName);
  if (fse.existsSync(fileName)) {
    ctx.body = { msg: "秒传成功", code: 200 };
  } else {
    ctx.body = { msg: "继续上传", code: 201 };
  }
});
router.post("/test", async (ctx, next) => {
  //设置请求过期时间
  ctx.request.socket.setTimeout(6 * 3600);
  ctx.body = { msg: "测试", code: 200 };
});
// 合并文件
router.post("/mergeFile", async (ctx, next) => {
  console.log("merge");
  //传入本来的文件名，合并文件
  const { name } = ctx.request.body;
  const fname = name.split(".")[0];
  const chunkDir = path.join(UPLOAD_DIR, fname);

  const chunks = await fse.readdir(chunkDir);
  chunks
    .sort((a, b) => a.split("_")[1] - b.split("_")[1])
    .map((chunkPath) => {
      console.log("[Log] chunkPath-->", chunkPath);
      // 合并文件
      let data = fse.readFileSync(`${chunkDir}/${chunkPath}`);
      fse.appendFileSync(path.join(UPLOAD_DIR, name), data);
    });
  console.log("[Log] chunks-->", chunks);

  // 删除临时文件夹
  fse.removeSync(chunkDir, (err) => {
    console.log("success");
    //合并成功后将原本数据清空
    fileObj[name] = [];
    if (err) {
      console.log("[Log] err-->", err);
      throw err;
    }
  });
  let consumTime = new Date().getTime() - startTime;

  // 返回文件地址
  ctx.body = {
    code: 200,
    msg: "合并成功",
    url: `http://localhost:${port}/static/${name}`,
    consumTime: consumTime,
  };
  isStart = true;
  startTime = null;
  fileObj = {};
});

app.use(router.routes());

/**
 * http server
 */
var server = http.createServer(app.callback());
server.listen(port);
console.log("demo1 server start ......   ", port);
