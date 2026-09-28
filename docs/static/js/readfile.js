(function (w) {
  "use strict";

  function decodeXml(s) {
    return String(s || "")
      .replace(/&amp;/g, "&")
      .replace(/&lt;/g, "<")
      .replace(/&gt;/g, ">")
      .replace(/&quot;/g, "\"")
      .replace(/&apos;/g, "'")
      .replace(/&#(\d+);/g, function (_, n) { return String.fromCharCode(parseInt(n, 10)); });
  }

  function docxText(buf) {
    if (!w.fflate || !w.fflate.unzipSync) throw new Error("文档解析组件未加载");
    var files = w.fflate.unzipSync(new Uint8Array(buf));
    var xmlBytes = files["word/document.xml"];
    if (!xmlBytes) throw new Error("这不是可读取的 docx");
    var xml = new TextDecoder("utf-8").decode(xmlBytes);
    var text = xml
      .replace(/<w:tab\/>/g, "\t")
      .replace(/<w:br\/>/g, "\n")
      .replace(/<\/w:p>/g, "\n")
      .replace(/<[^>]+>/g, "")
      ;
    text = decodeXml(text).replace(/\n{3,}/g, "\n\n").trim();
    if (!text) throw new Error("文档里没有可提取的文字");
    return text;
  }

  function pdfText(buf) {
    var lib = w.pdfjsLib;
    if (!lib) throw new Error("PDF 解析组件未加载");
    lib.GlobalWorkerOptions.workerSrc = "static/vendor/pdf.worker.min.js";
    return lib.getDocument({ data: new Uint8Array(buf) }).promise.then(function (pdf) {
      var parts = [];
      function page(n) {
        if (n > pdf.numPages) {
          var text = parts.join("\n\n").trim();
          if (!text) throw new Error("PDF 里没有可提取的文字");
          return text;
        }
        return pdf.getPage(n).then(function (p) {
          return p.getTextContent().then(function (tc) {
            var line = "";
            tc.items.forEach(function (it) {
              line += it.str || "";
              if (it.hasEOL) line += "\n";
            });
            parts.push(line);
            return page(n + 1);
          });
        });
      }
      return page(1);
    });
  }

  function readText(file) {
    return new Promise(function (resolve, reject) {
      var reader = new FileReader();
      reader.onload = function () { resolve(String(reader.result || "")); };
      reader.onerror = function () { reject(new Error("读取失败")); };
      reader.readAsText(file);
    });
  }

  function readBuffer(file) {
    return new Promise(function (resolve, reject) {
      var reader = new FileReader();
      reader.onload = function () { resolve(reader.result); };
      reader.onerror = function () { reject(new Error("读取失败")); };
      reader.readAsArrayBuffer(file);
    });
  }

  w.LX_READ_FILE = function (file) {
    var name = (file && file.name) || "";
    var ext = (name.split(".").pop() || "").toLowerCase();
    if (ext === "txt" || ext === "md" || ext === "json") return readText(file);
    if (ext === "docx") return readBuffer(file).then(docxText);
    if (ext === "pdf") return readBuffer(file).then(pdfText);
    if (ext === "doc") return Promise.reject(new Error("请另存为 docx 后再上传"));
    return Promise.reject(new Error("请上传 docx、pdf、txt 或 md"));
  };
})(window);
