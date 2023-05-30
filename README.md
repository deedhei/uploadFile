## 需求分析

针对文件上传

*   针对大文件上传，我们需要将他进行分片来提高文件上传的速度
*   对于文件上传失败了，可以通知用户文件上传失败需要重新上传
*   提供进度提示

## 前言

对于大文件上传，相信也是一个老调重谈的事情了，但是对于作为一个程序员是离不开大文件的复习和学习的他是必经之路

## 项目架构

这次的搭建前端使用 vue3 + Element Plus + Axios + spark-md5,后端使用koa+....进行搭建

## 创建项目

```vue
vue create bigFile
cd bigFile
npm i
```

## 创建Koa项目

```js

// koa2脚手架
npm install koa-generator -g
// 脚手架创建项目
koa2 server cd server yarn 
// 安装对应的库
yarn add koa-body fs-extra 
// 删去一些不需要使用的文件 全局引入koa-body 并且配置 创建upload路由
......
```

## 前端

我们使用el-upload去获取文件，对于文件切片，核心就是利用Blob.prototype.slice()，和数组的slice相似，我们可以使用这个方法获取文件的某一部分的片段不懂的同学可以去[补补课](https://developer.mozilla.org/zh-CN/docs/Web/API/Blob/slice),文件切片后，我们将这些切片进行并发发给服务端，由服务端进行合并，因为是并发，所以传输的顺序肯定是会变的，所以这个时候我们需要去记录片段的顺序，以便服务端去合并

## 服务端

服务端接收切片后，需要去合并切片。那么产生如下两个问题

*   怎么取合并切片
*   什么时候知道切片上传完成了

对于第一个问题我们可以使用`fs-extra`的读写流进行合并。
第二个问题我是解决办法是在每个请求的参数加一个文件总切片长度，对于每个切片我是的命名规则是`name.suffixName_index`,其中suffixName是后面明，name可以使用你的文件名，index是上传的第一个分片的index值，这样交给后端，后端沟通好就使用这个去区分。接下来我们就实现吧。

## 实现

### 前端代码

```vue
   <template>
  <div class="file-upload-fragment">
    <div class="file-upload-fragment-container">
      <el-upload
        class="fufc-upload"
        action=""
        :on-change="handleFileChange"
        :auto-upload="false"
        :show-file-list="false"
      >
        <template #trigger>
          <el-button class="fufc-upload-file" size="small" type="primary">
            选择文件
          </el-button>
        </template>
        <el-button
          class="fufc-upload-server"
          size="small"
          type="success"
          @click="handleUploadFile"
        >
          上传到服务器
        </el-button>
        <el-button
          class="fufc-upload-stop"
          size="small"
          type="primary"
          @click="stopUpload"
        >
          暂停上传
        </el-button>
        <el-button
          class="fufc-upload-continue"
          size="small"
          type="success"
          @click="continueUpload"
          >继续上传</el-button
        >
        <el-switch
          v-model="switchControl"
          active-color="#13ce66"
          inactive-color="#ff4949"
          active-text="使用多线程上传"
          inactive-text="遍历上传"
        >
        </el-switch>
      </el-upload>
      <el-progress :percentage="percentage" color="#409eff" />
    </div>
    <el-table
      :data="timeLog"
      style="width: 100%"
      v-loading="loading"
      element-loading-text="文件还在合并中..."
    >
      <el-table-column prop="date" label="时间"> </el-table-column>
      <el-table-column prop="consumTime" label="耗时"> </el-table-column>
      <el-table-column prop="size" label="文件大小"> </el-table-column>
    </el-table>
  </div>
</template>
```

上面是那些控件
![image.png](https://p9-juejin.byteimg.com/tos-cn-i-k3u1fbpfcp/3ae6ffbf1df24bde8a2c70780fba1d2a~tplv-k3u1fbpfcp-watermark.image?)
接下来我们看看实现函数的吧

```js
/**
 * 创建切片
 */
const createFileChunk = (file, size = 1024 * 10 * 1024) => {
  //定义一个数组用来存储每一份切片
  const fileChunkList = [];
  //存储索引，以cur和cur+size作为开始和结束位置利用slice方法进行切片
  let cur = 0;
  while (cur < file.size) {
    fileChunkList.push({ file: file.slice(cur, cur + size) });
    cur += size;
  }
  upload.total = fileChunkList.length;
  return fileChunkList;
};

/**
 * @description: 文件上传 Change 事件  选择文件
 * @param {*}
 * @return {*}
 */
const handleFileChange = async (file, files) => {
  console.log("[Log] file-->", file, files);
  upload.fileList = files;
  upload.currentFile = file;
  upload.name = file.name;
};
/**
 * @description: 文件上传 Click 事件
 * @param {*}
 * @return {*}
 */
const handleUploadFile = async () => {
  percentage.value = 0;
  controller = new AbortController();
  if (!upload.fileList.length) return;
  const fileChunkList = createFileChunk(upload.currentFile.raw); // 这里上传文件的时候进行分片
  // calculateHash ---- 计算hash
  const fileHash = await calculateHash(fileChunkList);
  // 获取后缀名
  let suffixName = upload.currentFile.name.split(".")[1];
  upload.currentFile.fileHashName = fileHash + "." + suffixName;
  upload.fileArr = fileChunkList.map(({ file }, index) => ({
    chunk: file,
    hash: fileHash + "." + suffixName + "_" + index, // 文件名  数组下标
  }));
  let result = await fileIsTransmission("http://localhost:8100/bigFile");
  console.log("[Log] result-->", result);
  if (result.code === 201) {
    handleUploadChunks();
  } else {
    ElMessageBox.alert("文件秒传成功", "文件上传", {
      confirmButtonText: "OK",
    });
  }
};
/**
 * 上传切片
 */
const handleUploadChunks = async () => {
  //设置请求头和监听上传的进度
  let configs = {
    headers: {
      "Content-Type": "multipart/form-data",
    },
    //设置超时时间
    timeout: 600000,
  };
  const requestList = upload.fileArr.map(({ chunk, hash }) => {
    const formData = new FormData();
    formData.append("file", chunk);
    formData.append("hash", hash);
    formData.append("filename", upload.currentFile.name);
    formData.append("total", upload.total);
    // console.log("[Log] formData-->", formData.get("hash")); // 直接打印formata是空的你需要使用get或者getAll的方法去打印
    return { formData };
  });

  let result = null;

  if (switchControl.value) {
    console.log("上面 ---- 并发");
    result = await ajax(
      "http://localhost:8100/bigFile",
      5,
      requestList,
      configs
    );
  } else {
    console.log("下面 ---- 遍历");
    result = await noConcurrency(
      "http://localhost:8100/bigFile",
      requestList,
      configs
    );
  }

  // return;
  if (result.code == 200) {
    let {
      data: { consumTime },
    } = await mergeRequest(upload.currentFile.fileHashName);
    console.log("[Log] consumTime-->", consumTime);
    timeLog.value.push({
      consumTime: consumTime,
      date: new Date().toLocaleString(),
      size: upload.currentFile.size,
    });
  }
};

```

有些东西加是后面优化实现的可以忽略看主要代码，因为不想删除太麻烦了，变量`upload`是用来保存文件数据用的

    const upload = reactive({
      //文件列表
      fileList: [],
      //存储当前文件
      currentFile: null,
      //当前文件名
      name: "",
      //存储切片后的文件数组
      fileArr: [],
      //切片总份数
      total: 0,
      timeLog: [], // 耗时记录
    });

`handleFileChange`是定义选择文件的事件该事件用来接收事件并进行保存文件相关信息
`handleUploadFile`是点击上传到服务器事件改事件功能第一步用来切割文件得到分片数组分片数组的结构是chunk和hash对应的分片名，再通过调用`handleUploadChunks`事件进行上传上传之前，需要将之前的切片数组再进行一次包装。

### 生成hash

无论是前端还是服务端，都必须要生成文件和切片的 hash，`之前我们使用文件名 + 切片下标作为切片 hash`，这样做文件名一旦修改就失去了效果，而事实上只要文件内容不变，hash 就不应该变化，所以正确的做法是`根据文件内容生成 hash`，所以我们修改一下 hash 的生成规则,所以上面我们使用了`spark-md5`,它可以根据文件内容计算出文件的 hash 值。另外一个问题是如果文件过大，可能会导致计算hash进行ui阻塞，导致页面假死，其实我们这边可以使用web-work方法进行去计算不懂的同学可以去[补补课](https://www.ruanyifeng.com/blog/2018/07/web-worker.html) 我这边就不实现了

```js
/**
 * 使用spark-md5计算hash
 */
const calculateHash = function (fileChunkList) {
  return new Promise((resolve) => {
    const spark = new SparkMD5.ArrayBuffer();
    const reader = new FileReader();
    const file = fileChunkList;
    // 文件大小
    const size = upload.currentFile.size;
    let offset = 2 * 1024 * 1024;
    let chunks = [file.slice(0, offset)];
    // 前面100K
    let cur = offset;
    while (cur < size) {
      // 最后一块全部加进来[]
      if (cur + offset >= size) {
        chunks.push(file.slice(cur, cur + offset));
      } else {
        // 中间的 前中后去两个字节
        const mid = cur + offset / 2;
        const end = cur + offset;
        chunks.push(file.slice(cur, cur + 2));
        chunks.push(file.slice(mid, mid + 2));
        chunks.push(file.slice(end - 2, end));
      }
      // 前取两个字节
      cur += offset;
    }
    // 拼接
    reader.readAsArrayBuffer(new Blob(chunks));
    reader.onload = (e) => {
      spark.append(e.target.result);
      resolve(spark.end());
    };
  });
};

```

### 文件秒传

这个功能的意思就是说，我们在文件上传之前，去问一下服务器，你有没有这个文件呀，你没有的话我就开始上传，你要是有的话我就偷个懒，用你有的我就不上传了。

所以需要实现一个检测接口(verify)，去询问服务器有没有这个文件，因为我们之前是计算过文件的 hash的，能保证文件的唯一性。就用这个hash就能唯一的判断这个文件。所以这个接口的思路也很简单，就是判断我们的 `target`目录下是否存在这个文件。上面我们计算了hash即使你改了文件名我一样知道hash值，根据hash和后缀名我就知道文件有没有了。

```js
/**
 * 文件秒传
 */
const fileIsTransmission = () => {
  let data = {
    hash: upload.currentFile.fileHashName,
  };
  return new Promise((resolve, resject) => {
    axios.post("http://localhost:8100/isExitFile", data).then((res) => {
      resolve(res.data);
    });
  });
};
```

代码定义好后我们就只需要在上传之前去判断这个文件有没有上传。
以下是后端代码的文件秒传

```js
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
```

### 进度条功能

进度条功能其实没有那么难，当一个分片上传完成的时候，后端返回相应的状态码，进而前端根据沟通好的状态进行爹叠加，具体是后端怎么做去沟通就好了

![image.png](https://p1-juejin.byteimg.com/tos-cn-i-k3u1fbpfcp/be407cae3e2e461a88a3d96a5172b080~tplv-k3u1fbpfcp-watermark.image?)
我这边是在`.then`拿到返回值根据状态去判断然后改变进度

### 断点续传

断点续传，其实就是当你暂停了上传，后续的请求就不会再去上传了，因为我们使用的是`axios`，所以我这边还特意去github看了下axios的取消请求  [直通车](https://github.com/axios/axios)。

![image.png](https://p3-juejin.byteimg.com/tos-cn-i-k3u1fbpfcp/2d93de92401148c79eb9018fe236ae5f~tplv-k3u1fbpfcp-watermark.image?)
找到这个目录点击。

![image.png](https://p3-juejin.byteimg.com/tos-cn-i-k3u1fbpfcp/893c326f9df444019285749d5be4eedc~tplv-k3u1fbpfcp-watermark.image?)
CancelToken文档已经说了在v0.22.0后续版本已经不再使用了，所以使用上面的abortController，那么使用abortController可能会遇到一个问题就是当你取消再去请求的时候就用不了，所以我们需要进行改造，怎么改造呢？

![image.png](https://p9-juejin.byteimg.com/tos-cn-i-k3u1fbpfcp/ff566acc5b284257b2be35a2357df11c~tplv-k3u1fbpfcp-watermark.image?)
当你调用事件的时候再去进行赋值

![image.png](https://p9-juejin.byteimg.com/tos-cn-i-k3u1fbpfcp/33929bb57dad4ad084ded0582bbe673a~tplv-k3u1fbpfcp-watermark.image?)
进行请求的时候再去给`signal`进行赋值
取消请求我们直接去判断有没有这个`controller`就不需要调用，如果有我们需要使用abort事件还需要将`controller`进行赋值为`null`,如果对`signal`不熟悉的可以去[补补课](https://developer.mozilla.org/zh-CN/docs/Web/API/AbortController/signal)。

断点续传其实还没有做完，对于断点续传和恢复重传是一个相通的事件，那么问题来了，我如何去判断

*   我哪个地方已经上传了
*   哪个地方没有去上传
*   从哪里开始去上传

针对这些问题，所以我对代码进行了改动我把上传的所有切片用一个全局变量去存储`requestList`，后端因为对于每个分片都去成功返回成功的代码，所以当我暂停传的时候会接收到最开始的状态码，我拿到状态码根据文件名获得index,利用index去`splice`数组`requestList`就可以了。

### 恢复上传

恢复上传在我解决完断点续传的时候是非常好解决的

```js
/**
 * @description: 继续上传 Click 事件
 * @param {*}
 * @return {*}
 */
const continueUpload = async () => {
  controller = new AbortController();
  let result = await fileIsTransmission("http://localhost:8100/bigFile"); // 文件秒传判断
  if (result.code === 201) {
    handleUploadChunks();
  } else {
    ElMessageBox.alert("文件秒传成功", "文件上传", {
      confirmButtonText: "OK",
    });
  }
};
```

我们只需要调用`handleUploadChunks()`再去上传就可以了直到把数组`requestList`上传完就OK了。

下面我把运行的结果用gif展示出来去

![大文件上传.gif](https://p9-juejin.byteimg.com/tos-cn-i-k3u1fbpfcp/10b8f6fddb314feeb231e1100a265e22~tplv-k3u1fbpfcp-watermark.image?)

### 总结

至此我们文件上传完成了

*   我们使用Blob.prototype.slice 将文件切片，并发上传多个分片
*   服务端接收分片进行合并
*   使用 spark-md5 根据文件内容算出文件 hash
*   使用hash去判断是否文件秒传
*   使用AbortController去取消请求

### 问题

*   [x] 没有处理上传失败情况
*   [x] 文件太大的话计算hash就会十分十分卡顿 哪怕我们使用了 web worker
*   [x] 上传文件请求太多，会导致浏览器崩溃
*   [ ] chunk定时清理等等

其实还有很多优化的地方，本人菜鸟没去实现，以上是我的实现和建议，并没有什么都去完善，可能看到你的不满意的地方，请勿喷

### 源代码
[fileUpload](https://github.com/deedhei/uploadFile)
### 反馈问题
喜欢有趣的同学可以把你的问题评论在下方我们一起去研究哇。
