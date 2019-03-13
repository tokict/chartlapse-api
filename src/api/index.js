import {
    version
} from "../../package.json";
import {
    Router
} from "express";
import facets from "./facets";
import fs from "fs";
import puppeteer from "puppeteer";
const {
    exec
} = require("child_process");
var page;
var browser;

export default ({
    config,
    db
}) => {
    let api = Router();

    // mount the facets resource
    api.use("/facets", facets({
        config,
        db
    }));

    // perhaps expose some API metadata at the root
    api.get("/test", (req, res) => {
        res.json({
            version
        });
    });

    api.get("/render/:group/:hash", (req, res) => {
        (async() => {
            browser = await puppeteer.launch({
                headless: true
            });

            const context = await browser.createIncognitoBrowserContext();
            page = await context.newPage();
            console.log(
                "http://192.168.1.66:3000/?group=" +
                req.params.group +
                "&hash=" +
                req.params.hash +
                "&startAt=0&endAt=10&puppeteer=true"
            );
            await page.goto(
                "http://192.168.1.66:3000/?group=" +
                req.params.group +
                "&hash=" +
                req.params.hash +
                "&startAt=0&endAt=10&puppeteer=true", {
                    timeout: 0
                }
            );
            // const override = Object.assign(page.viewport(), { width: 800 });
            //await page.setViewport(override);

            var functionToInject = function() {
                return window.encodingDone;
            };

            const checkInterval = setInterval(async() => {
                var done = await page.evaluate(functionToInject);
                if (done) {
                    clearInterval(checkInterval);
                    browser.close();

                    exec(
                        "ffmpeg -i " +
                        req.params.hash +
                        '.gif -movflags faststart -pix_fmt yuv420p -vf "scale=trunc(iw/2)*2:trunc(ih/2)*2" -b 5000k -s 1920x1080 ' +
                        req.params.hash +
                        ".mp4"
                    );
                }
            }, 1000);
        })();

        res.json("OK");
    });

    api.post("/saveGif", async(req, res) => {
        fs.writeFile("./" + req.headers.hash + ".gif", req.body, function(err) {
            if (err) {
                console.log("err", err);
            } else {
                return res.json({
                    status: "success"
                });
            }
        });
    });


    return api;
};