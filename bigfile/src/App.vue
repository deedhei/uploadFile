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
<script setup>
import { ref, reactive } from "vue";
import { ElMessage, ElMessageBox } from "element-plus";
import SparkMD5 from "spark-md5";
import axios from "axios";
let switchControl = ref(true); // 空间开关
let percentage = ref(0); //  进度数值
let loading = ref(false); // loading
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
const timeLog = ref([]); // 记录日志
let controller = null; // 中止控制器
let requestList = null; // 上传的分片数组
let requestListLength = 0; // 记录分片数组长度 因为后面requestList会被切掉（暂停）所以要保存长度
let tempLength = 0; // 记录暂停的进度
//设置请求头和监听上传的进度
let configs = {
  headers: {
    "Content-Type": "multipart/form-data",
  },
  //设置超时时间
  timeout: 600000,
};
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
  let result = await fileIsTransmission("http://localhost:8100/bigFile"); // 文件秒传判断
  console.log("[Log] result-->", result);
  if (result.code === 201) {
    requestList = upload.fileArr.map(({ chunk, hash }) => {
      const formData = new FormData();
      formData.append("file", chunk);
      formData.append("hash", hash);
      formData.append("filename", upload.currentFile.name);
      formData.append("total", upload.total);
      // console.log("[Log] formData-->", formData.get("hash")); // 直接打印formata是空的你需要使用get或者getAll的方法去打印
      return { formData };
    });
    requestListLength = requestList.length;
    handleUploadChunks();
  } else {
    ElMessageBox.alert("文件秒传成功", "文件上传", {
      confirmButtonText: "OK",
    });
  }
};
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

/**
 * 上传切片
 */

const handleUploadChunks = async () => {
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

/**
 * @description: 暂停上传 Click 事件
 * @param {*}
 * @return {*}
 */
const stopUpload = async () => {
  if (controller) {
    controller.abort();
    controller = null;
  }
};
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
/**
 * @param {Array<String>} url 请求地址
 * @param {Number} n 控制并发数量
 * @param {String} params 接口传递参数
 * @param {Object} configs 接口配置
 */
const ajax = (url, n, params, configs) => {
  const length = params.length;
  console.log("[Log] params-->", params);
  const result = [];
  let flag = 0; // 控制进度，表示当前位置
  let sum = 0; // 记录请求完成总数
  let signal = controller.signal;
  let times = false;
  return new Promise((resolve, reject) => {
    // 先连续调用n次，就代表最大并发数量
    while (flag < n) {
      next();
    }
    function next() {
      const cur = flag++; // 利用闭包保存当前位置，以便结果能顺序存储
      if (cur >= length) return;
      axios
        .post(url, params[cur]["formData"], { ...configs, signal })
        .then((res) => {
          result[cur] = cur; // 保存结果。为了体现顺序，这里保存索引值
          percentage.value = Math.ceil(
            ((cur + 1 + tempLength) / requestListLength) * 100
          );
          console.log("文件上传", res);
          if (++sum >= length) {
            resolve(res.data);
          } else {
            next();
          }
        })
        .catch(() => {
          if (!times) {
            times = true;
            tempLength = cur;
            requestList.splice(0, cur);
          }
        });
    }
  });
};
/**
 * 发送合并切片请求
 */
const mergeRequest = async (name) => {
  loading.value = true;
  let data = {
    name,
  };
  return new Promise((resolve, reject) => {
    axios.post("http://localhost:8100/mergeFile", data).then((res) => {
      console.log("[Log] 合并-->", res);
      loading.value = false;
      resolve(res);
    });
  });
};
/*
 * @date: 2023-05-23 19:11:02  @author: zhuxing
 * @param {Array<String>}: url 请求地址
 * @param {String}: params 接口传递参数
 * @param {Object} configs 接口配置
 */
const noConcurrency = (url, params, configs) => {
  let current = ref(0);
  const length = params.length;
  let times = false;
  let signal = controller.signal;
  console.log("[Log] params-->", params);
  return new Promise((resolve, reject) => {
    params.map(({ formData }) => {
      const res = axios.post(url, formData, { ...configs, signal }).then(
        (res) => {
          // 上传成功后的处理
          console.log("文件上传", res.data);
          if (res.data.code == 201) {
            current.value += 1;
            percentage.value = Math.ceil(
              ((current.value + tempLength) / requestListLength) * 100
            );
          }
          if (res.data.code == 200) {
            resolve(res.data);
          }
        },
        (err) => {
          console.log("[Log] err-->", err);
          // 出现错误时的处理
          if (!times) {
            console.log("[Log] current.value-->", current.value);
            times = true;
            tempLength = current.value;
            requestList.splice(0, current.value);
          }
        }
      );
    });
  });
};

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
</script>

<style scoped>
.file-upload-fragment {
  width: 100%;
  height: 100%;
  padding: 10px;
}
.file-upload-fragment-container {
  position: relative;
  margin: 0 auto;
  width: 600px;
  height: 70px;
  top: calc(50% - 150px);
  min-width: 400px;
}
.fufc-upload {
  display: flex;
  justify-content: space-between;
  align-items: center;
}
.el-progress {
  margin-top: 10px;
}
.el-progress::v-deep(.el-progress__text) {
  min-width: 0px;
}
</style>
