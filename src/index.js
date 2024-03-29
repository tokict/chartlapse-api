import http from "http";
import express from "express";
import cors from "cors";
import bodyParser from "body-parser";
import initializeDb from "./db";
import middleware from "./middleware";
import api from "./api";
import moment from "moment";
import config from "./config.json";
import Queue from "async/queue";
import puppeteer from "puppeteer";
import helmet from "helmet";
import JwtValidator from "express-jwt";
import fs from "fs";
import CookieParser from "cookie-parser";

import { sendMail, updateChartLog } from "./lib/util.js";
import { MYSQL_TIME_FORMAT } from "./api/constants";
var morgan = require('morgan')

var md5 = require("md5");
const path = require("path");
var page;
var browser;
let dbInstance;
let app = express();

const getUser = id =>
    dbInstance("wp_users")
    .leftJoin("wp_pms_member_subscriptions", "user_id", "user_id")
    .where({
        user_id: id,
        status: "active"
    })
    .select("user_nicename", "status", "subscription_plan_id", "user_email")
    .first();

app.server = http.createServer(app);
app.use(CookieParser());

// 3rd party middleware
app.use(
    cors({
        exposedHeaders: config.corsHeaders
    })
);
app.use(helmet());
app.use(morgan('tiny'))
app.use(bodyParser.json({ type: "application/json" }));

// connect to db
initializeDb(db => {
    // internal middleware
    dbInstance = db;

    app.use(middleware({ config, db }));
    app.use(
        JwtValidator({
            secret: config.jwtKey,
            getToken: function fromHeaderOrQuerystring(req) {
                if (
                    req.headers.authorization &&
                    req.headers.authorization.split(" ")[0] === "Bearer"
                ) {
                    return req.headers.authorization.split(" ")[1];
                } else if (req.cookies["access_token"]) {
                    return req.cookies["access_token"];
                }
                return null;
            }
        }).unless(function(req) {
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

global.renderQueue = new Queue(async(params, callback) => {
    try {
        const user = await getUser(params.user);
        if (!params.userTitle || params.userTitle == "") {
            params.userTitle = moment().format(MYSQL_TIME_FORMAT);
        }
        params.hash = params.userTitle ? md5(params.userTitle) : params.hash;
        console.log("Starting " + user.user_nicename + "/" + params.hash);
        const args = puppeteer.defaultArgs().filter(arg => arg !== '--disable-gpu');
        args.push('--use-gl=desktop');
        args.push('--disable-web-security');
        browser = await puppeteer.launch({
            headless: true,
            ignoreDefaultArgs: true,
            args
        });
        params.renderStartTime = moment();

        page = await browser.newPage();
        const override = Object.assign(page.viewport(), { width: 800 });
        await page.setViewport(override);
        await page.goto(
            config.hostname + "/?group=" +
            params.group +
            "&hash=" +
            params.hash +
            "&startAt=0&endAt=10&puppeteer=true&username=" +
            user.user_nicename, {
                timeout: 0,
                waitUntil: "networkidle2"
            }
        );

        await page.waitFor("input[name=userdata]");
        await page.$eval(
            "input[name=userdata]",
            (el, value) => (el.value = value),
            JSON.stringify({...params, ...user })
        );

        var functionToInject = function(data) {
            return {
                done: document.encodingDone,
                renderProgress: document.renderProgress,
                captureProgress: document.capturedFramesProgress,
                framesPerSecond: document.framesPerSecond,
                msg: document.msg
            };
        };

        const checkInterval = setInterval(async db => {
            var data = await page.evaluate(functionToInject);
            console.log(data)
            if (data.done) {
                clearInterval(checkInterval);

                sendMail(
                    user.user_email,
                    "Your chart is ready",
                    "You can get your gif at: " +
                    config.apiHostname +
                    "/api/downloadUserGif/" +
                    params.hash +
                    ".gif\r\n" +
                    "You can get your video at: " +
                    config.apiHostname +
                    "/api/downloadUserVideo/" +
                    params.hash +
                    ".mp4"
                );

                addToStats(data.framesPerSecond);

                updateChartLog(params, dbInstance);

                browser.close();


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

/**
 * Lets get the render stats file
 *
 */
global.renderStats = fs.existsSync("./renderStats.json");
if (!global.renderStats) {
    global.renderStats = [];
} else {
    global.renderStats = JSON.parse(fs.readFileSync("./renderStats.json"));
}

global.queue.forEach(item => {
    global.renderQueue.push(item, null, true);
});

const addToStats = time => {
    global.renderStats.push(time);

    if (global.renderStats.length > 100) {
        global.renderStats.slice(0, 1);
    }
    fs.writeFile(
        "./renderStats.json",
        JSON.stringify(global.renderStats),
        function(err) {
            if (err) {
                console.log("err saving stats", err);
            } else {
                console.log("Stats updated");
            }
        }
    );
};

export default app;