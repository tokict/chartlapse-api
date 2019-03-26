import http from "http";
import express from "express";
import cors from "cors";
import morgan from "morgan";
import bodyParser from "body-parser";
import initializeDb from "./db";
import middleware from "./middleware";
import api from "./api";
import config from "./config.json";
import Queue from "async/queue";
import puppeteer from "puppeteer";
import JwtValidator from "express-jwt";
const { exec } = require("child_process");
var page;
var browser;

let app = express();

app.server = http.createServer(app);

// logger
app.use(morgan("dev"));
app.use(JwtValidator({ secret: config.jwtKey }).unless({ path: ["/token"] }));

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

global.renderQueue = new Queue(async (params, callback) => {
  try {
    console.log("Starting " + params.group + "/" + params.hash);
    browser = await puppeteer.launch({
      headless: true
    });

    const context = await browser.createIncognitoBrowserContext();
    page = await context.newPage();

    await page.goto(
      "http://192.168.1.100:3000/?group=" +
        params.group +
        "&hash=" +
        params.hash +
        "&startAt=0&endAt=10&puppeteer=true",
      {
        timeout: 0
      }
    );
    // const override = Object.assign(page.viewport(), { width: 800 });
    //await page.setViewport(override);

    var functionToInject = function() {
      return window.encodingDone;
    };

    const checkInterval = setInterval(async () => {
      var done = await page.evaluate(functionToInject);
      if (done) {
        clearInterval(checkInterval);
        console.log("Done, " + params.hash);
        browser.close();
        callback(null, null);
        exec(
          "ffmpeg -i " +
            params.hash +
            '.gif -movflags faststart -pix_fmt yuv420p -vf "scale=trunc(iw/2)*2:trunc(ih/2)*2" -b 5000k -s 1920x1080 ' +
            params.hash +
            ".mp4"
        );
      }
    }, 1000);
  } catch (e) {
    console.log(e);
  }
}, 1);

global.renderQueue.drain = function() {
  console.log("all items have been processed");
};

export default app;
