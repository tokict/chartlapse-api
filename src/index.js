import http from "http";
import express from "express";
import cors from "cors";
import bodyParser from "body-parser";
import initializeDb from "./db";
import middleware from "./middleware";
import api from "./api";
import config from "./config.json";
import Queue from "async/queue";
import puppeteer from "puppeteer";
import JwtValidator from "express-jwt";
import fs from "fs";
const exec = require("await-exec");

var page;
var browser;

let app = express();

app.server = http.createServer(app);

// 3rd party middleware
app.use(
  cors({
    exposedHeaders: config.corsHeaders
  })
);

app.use(bodyParser.raw({ type: "application/octet-stream", limit: 999999999 }));

// connect to db
initializeDb(db => {
  // internal middleware
  app.use(middleware({ config, db }));
  app.use(
    JwtValidator({ secret: config.jwtKey }).unless(function(req) {
      return req.path.includes(["/api/saveGif"]);
    })
  );
  // api router
  app.use("/api", api({ config, db }));

  app.server.listen(process.env.PORT || config.port, () => {
    console.log(
      `Started on IP: ${app.server.address().address} port ${
        app.server.address().port
      }`
    );
  });
});

const removeAndSaveQueue = params => {
  console.log("Removing");
  const index = global.queue.findIndex(
    item =>
      item.user === params.user &&
      item.group === params.group &&
      item.hash === params.hash
  );
  global.queue.splice(index, 1);

  fs.writeFile("./queue.json", JSON.stringify(queue), function(err) {
    if (err) {
      console.log("err saving queue", err);
    } else {
      console.log("Queue updated");
    }
  });
};

global.renderQueue = new Queue(async (params, callback) => {
  try {
    console.log("Starting " + params.group + "/" + params.hash);
    browser = await puppeteer.launch({
      headless: true
    });

    const context = await browser.createIncognitoBrowserContext();
    page = await context.newPage();

    await page.goto(
      "http://app.chartlapse.lo:3000/?group=" +
        params.group +
        "&hash=" +
        params.hash +
        "&startAt=0&endAt=10&puppeteer=true",
      {
        timeout: 0
      }
    );
    const override = Object.assign(page.viewport(), { width: 800 });
    await page.setViewport(override);

    var functionToInject = function() {
      return {
        done: document.encodingDone,
        renderProgress: document.renderProgress,
        captureProgress: document.capturedFramesProgress,
        msg: document.msg
      };
    };

    const checkInterval = setInterval(async () => {
      var data = await page.evaluate(functionToInject);
      console.log(data);
      if (data.done) {
        clearInterval(checkInterval);
        console.log("Done, " + params.hash);
        console.log(data.msg);
        browser.close();
        await exec(
          "ffmpeg -i " +
            params.hash +
            '.gif -movflags faststart -pix_fmt yuv420p -vf "scale=trunc(iw/2)*2:trunc(ih/2)*2" -b 5000k -s 1920x1080 ' +
            params.hash +
            ".mp4"
        );
        removeAndSaveQueue(params);
        callback(null, null);
      }
    }, 1000);
  } catch (e) {
    console.log(e);
  }
}, 1);

global.renderQueue.drain = function() {
  console.log("all items have been processed");
};

/**
 * Lets get the queue file
 *
 */
global.queue = fs.existsSync("./queue.json");
if (!global.queue) {
  global.queue = [];
} else {
  global.queue = JSON.parse(fs.readFileSync("./queue.json"));
}

global.queue.forEach(item => {
  global.renderQueue.push(item, null, true);
});

export default app;
