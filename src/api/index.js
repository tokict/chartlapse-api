import { version } from "../../package.json";
import { Router } from "express";
import facets from "./facets";
import fs from "fs";

var knex = require("knex")({
  client: "mysql",
  connection: {
    host: "127.0.0.1",
    user: "chartlapse_wp",
    password: "antoniya8472",
    database: "chartlapse"
  }
});

const addAndSaveQueue = params => {
  const index = global.queue.findIndex(
    item =>
      item.user === params.user &&
      item.group === params.group &&
      item.hash === params.hash
  );

  if (index !== -1) return false;
  global.queue.push(params);

  fs.writeFile("../queue.json", JSON.stringify(queue), function(err) {
    if (err) {
      console.log("err saving queue", err);
    } else {
      console.log("Queue updated");
    }
  });
  return true;
};

export default ({ config, db }) => {
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
    const u = knex("wp_users")
      .leftJoin("wp_pms_member_subscriptions", "user_id", "user_id")
      .where({
        user_id: req.user.data.user.id
      })
      .select("user_nicename", "status", "subscription_plan_id")
      .first()
      .then(u =>
        res.send({
          userData: u
        })
      );
  });

  api.get("/render/:group/:hash", (req, res) => {
    req.params.user = req.user.data.user.id;
    const index = global.queue.findIndex(item => {
      return (
        item.user === req.params.user &&
        item.group === req.params.group &&
        item.hash === req.params.hash
      );
    });

    if (index !== -1) {
      res.status(403);
      res.send();
    } else {
      addAndSaveQueue(req.params);
      global.renderQueue.push(
        { ...req.params, user: req.user.data.user.id },
        function(err) {
          if (err) {
            res.status(400).send(err);
          } else {
            console.log(
              "finished processing " + req.params.group + "/" + req.params.hash
            );
            res.json("OK");
            // Create download links and send mail
          }
        }
      );
    }
  });

  api.post("/saveGif", async (req, res) => {
    console.log(req.body);
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
