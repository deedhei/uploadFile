const { defineConfig } = require("@vue/cli-service");
module.exports = defineConfig({
  transpileDependencies: true,
  lintOnSave: false,
  devServer: {
    proxy: {
      "/api": {
        target: "http://localhost:8100/bigFile", // 代理地址
        pathRewrite: {
          "^/api": "",
        },
        // 默认代理服务器，会以我们实际在浏览器请求的主机名【localhost:8080】，作为代理服务器的主机名，
        // 然后代理服务器会带上这个主机名，去请求github，然而 github是不认识 【localhost:8080】
        //  changeOrigin: true 就是以实际代理请求发生过程中的主机名去请求，如：代理服务器的主机名
        changeOrigin: true,
      },
    },
  },
});
