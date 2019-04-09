import { version } from "../../package.json";
import { Router } from "express";
import facets from "./facets";
import fs from "fs";
import moment from "moment";
import bodyParser from "body-parser";
import {
    sendMail,
    isUserAllowedToCreate,
    logChartCreation
} from "../lib/util.js";
var md5 = require("md5");
const path = require("path");
const exec = require("await-exec");



export default ({ config, db }) => {
    const getUser = id =>
        db("wp_users")
        .leftJoin("wp_pms_member_subscriptions", "user_id", "user_id")
        .where({
            user_id: id,
            status: "active"
        })
        .select("user_nicename", "status", "subscription_plan_id", "user_email")
        .first();

    const addAndSaveQueue = params => {
        const index = global.queue.findIndex(
            item => item.user === params.user && item.userTitle === params.userTitle
        );

        if (index !== -1) return false;

        const sum = global.renderStats.length ?
            global.renderStats.reduce((previous, current) => (current += previous)) :
            0;
        const avg = sum ? sum / global.renderStats.length : 2;
        const milisecondsInGif = params.dataLength * 1500; // animation duration
        const framesInGif = milisecondsInGif / 50; // capture Delay

        const ends = new moment().add(avg * framesInGif, "seconds");
        const now = moment();
        const expectedProcessingTime = moment.duration(ends.diff(now));

        params.timeToProcess = parseInt(expectedProcessingTime.asMinutes());
        params.queuePosition = global.queue.length ? global.queue : 1;
        const unique_id = logChartCreation(params, db);

        global.queue.push(params);
        getUser(params.user).then(u => {
            sendMail(
                u.user_email,
                "Your chart is queued for render",
                "The estimated time for completion is: " +
                params.timeToProcess +
                " minutes"
            );
        });

        fs.writeFile("./queue.json", JSON.stringify(queue), err => {
            if (err) {
                console.log("err saving queue", err);
            } else {
                let totalInQueue = 0;
                for (let item in global.queue) {
                    totalInQueue = totalInQueue + global.queue[item].timeToProcess;
                }
                console.log(
                    "Queue updated! Expected delivery: " + totalInQueue + " minutes"
                );
            }
        });
        return unique_id;
    };

    const checkAndCreateUserFolder = username => {
        const dir = "./data/" + username;

        if (!fs.existsSync(dir)) {
            fs.mkdirSync(dir);
        }
    };

    let api = Router();

    // mount the facets resource
    api.use(
        "/facets",
        facets({
            config,
            db
        })
    );

    // perhaps expose some API metadata at the root
    api.get("/test", (req, res) => {
        res.json({
            version
        });
    });

    api.get("/me", (req, res) => {
        db("wp_users")
            .leftJoin("wp_pms_member_subscriptions", "user_id", "user_id")
            .where({
                user_id: req.user.data.user.id
            })
            .select("user_nicename", "status", "subscription_plan_id", "user_email")
            .first()
            .then(u =>
                res.send({
                    userData: u,
                    email: u.user_email
                })
            );
    });

    api.post("/render", async(req, res) => {
        req.params.user = req.user.data.user.id;
        const limits = await isUserAllowedToCreate(req.params, db);

        if (limits.left < 1) {
            res.status(200);
            res.json({
                error: "You have reached your render limit for the day. Please try again tomorrow"
            });
            return;
        }

        const index = global.queue.findIndex(item => {
            return (
                item.user === req.params.user && item.userTitle === req.body.userTitle
            );
        });

        if (index !== -1) {
            res.status(403);
            res.send();
        } else {
            getUser(req.params.user).then(u => {
                req.body.username = u.user_nicename;

                const unique_id = addAndSaveQueue({
                    ...req.body,
                    user: req.params.user
                });
                global.renderQueue.push({ unique_id: unique_id, ...req.body, user: req.user.data.user.id },
                    function(err) {
                        if (err) {
                            res.status(400).send(err);
                        } else {
                            console.log(
                                "finished processing " +
                                req.body.username +
                                "/" +
                                req.body.userTitle
                            );

                            // Create download links and send mail
                        }
                    }
                );
                res.json({ left: limits });
            });
        }
    });

    api.post(
        "/saveGif",
        bodyParser.raw({ type: "application/octet-stream", limit: 999999999 }),
        async(req, res) => {
            checkAndCreateUserFolder(req.headers.username);
            const filePath = path.normalize(__dirname +
                "/../../data/" +
                req.headers.username +
                "/" +
                md5(req.headers.title));

            fs.writeFile(filePath + ".gif",
                req.body,
                async function(err) {
                    console.log("Written: ", filePath)
                    if (err) {
                        console.log("err", err);
                    } else {


                        res.json({
                            status: "success"
                        });
                        await exec(
                            "ffmpeg -i " +
                            filePath +
                            '.gif -movflags faststart -pix_fmt yuv420p -vf "scale=trunc(iw/2)*2:trunc(ih/2)*2" -b 5000k -s 1920x1080 ' +
                            filePath +
                            ".mp4"
                        );


                    }
                }
            );
        }
    );

    api.get("/downloadUserGif/:filename", (req, res) => {
        getUser(req.user.data.user.id).then(u => {
            const file =
                __dirname +
                "/../../data/" +
                u.user_nicename +
                "/" +
                req.params.filename;
            res.download(file); // Set disposition and send it.
        });
    });

    api.get("/downloadUserVideo/:filename", (req, res) => {
        getUser(req.user.data.user.id).then(u => {
            const file =
                __dirname +
                "/../../data/" +
                u.user_nicename +
                "/" +
                req.params.filename;
            res.download(file); // Set disposition and send it.
        });
    });

    return api;
};