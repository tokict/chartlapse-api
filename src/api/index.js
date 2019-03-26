import { version } from "../../package.json";
import { Router } from "express";
import facets from "./facets";
import fs from "fs";
import { ACTIVE_SUBSCRIPTION_PLAN_ID } from "./constants";

var knex = require("knex")({
  client: "mysql",
  connection: {
    host: "127.0.0.1",
    user: "chartlapse_wp",
    password: "antoniya8472",
    database: "chartlapse"
  }
});

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
    global.renderQueue.push(req.params, function(err) {
      console.log(
        "finished processing " + req.params.group + "/" + req.params.hash
      );
    });

    res.json("OK");
  });

  api.post("/saveGif", async (req, res) => {
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
