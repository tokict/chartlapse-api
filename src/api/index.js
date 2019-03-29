import { version } from "../../package.json";
import { Router } from "express";
import facets from "./facets";
import fs from "fs";

import moment from "moment";
import bodyParser from "body-parser";
import { sendMail } from "../lib/util.js";
var md5 = require("md5");

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

    const sum = global.renderStats.length
      ? global.renderStats.reduce((previous, current) => (current += previous))
      : 0;
    const avg = sum ? sum / global.renderStats.length : 2;
    const milisecondsInGif = params.dataLength * 1500; // animation duration
    const framesInGif = milisecondsInGif / 50; // capture Delay

    const ends = new moment().add(avg * framesInGif, "seconds");
    const now = moment();
    const expectedProcessingTime = moment.duration(ends.diff(now));

    params.timeToProcess = parseInt(expectedProcessingTime.asMinutes());

    global.queue.push(params);

    getUser(params.user).then(u =>
      sendMail(
        u.user_email,
        "Your chart is queued for render",
        "The estimated time for completion is: " +
          params.timeToProcess +
          " minutes"
      )
    );

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
    return true;
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

  api.post("/render", (req, res) => {
    req.params.user = req.user.data.user.id;

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

        addAndSaveQueue({ ...req.body, user: req.params.user });
        global.renderQueue.push(
          {
            ...req.body,
            user: req.user.data.user.id
          },
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
        res.json("OK");
      });
    }
  });

  api.post(
    "/saveGif",
    bodyParser.raw({ type: "application/octet-stream", limit: 999999999 }),
    async (req, res) => {
      checkAndCreateUserFolder(req.headers.username);
      console.log(req.headers);
      fs.writeFile(
        "./data/" +
          req.headers.username +
          "/" +
          md5(req.headers.title) +
          ".gif",
        req.body,
        function(err) {
          if (err) {
            console.log("err", err);
          } else {
            return res.json({
              status: "success"
            });
          }
        }
      );
    }
  );

  return api;
};
