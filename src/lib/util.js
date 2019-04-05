import nodemailer from "nodemailer";
import moment from "moment";
import md5 from "md5";
import {
    FREE_SUBSCRIPTION_PLAN_ID,
    BASIC_SUBSCRIPTION_PLAN_ID,
    PRO_SUBSCRIPTION_PLAN_ID,
    MYSQL_TIME_FORMAT
} from "../api/constants";
const isWin = process.platform === "win32";

/**	Creates a callback that proxies node callback style arguments to an Express Response object.
 *	@param {express.Response} res	Express HTTP Response
 *	@param {number} [status=200]	Status code to send on success
 *
 *	@example
 *		list(req, res) {
 *			collection.find({}, toRes(res));
 *		}
 */

export function toRes(res, status = 200) {
    return (err, thing) => {
        if (err) return res.status(500).send(err);

        if (thing && typeof thing.toObject === "function") {
            thing = thing.toObject();
        }
        res.status(status).json(thing);
    };
}

const opts = isWin ? {
    host: "smtp.zoho.com",
    port: 465,
    secure: true, // true for 465, false for other ports
    auth: {
        user: "info@lorecore.com", // generated ethereal user
        pass: "theborg8472" // generated ethereal password
    }
} : {
    sendmail: true,
    newline: "unix",
    path: "/usr/sbin/sendmail"
};

const transporter = nodemailer.createTransport(opts);

export function logChartCreation(params, db) {
    const unique_id = md5(params.hash + params.user + moment().valueOf());
    db("graphs")
        .insert({
            unique_id: unique_id,
            user_id: params.user * 1,
            graph_title: params.userTitle,
            graph_data: JSON.stringify(params.userData),
            request_time: moment().format(MYSQL_TIME_FORMAT),
            graph_hash: params.hash,
            estimated_render_time: params.timeToProcess,
            queue_position: params.queuePosition
        })
        .then(res => console.log("Chart logged", res));

    return unique_id;
}

export async function isUserAllowedToCreate(params, db) {
    const plan = await db("wp_pms_member_subscriptions")
        .where({ user_id: params.user })
        .select("subscription_plan_id as plan_id")
        .first();

    const number = await db("graphs as g")
        .leftJoin(
            "wp_pms_member_subscriptions as subs",
            "subs.user_id",
            "g.user_id"
        )
        .where({
            "g.user_id": params.user,
            "subs.status": "active"
        })

    .whereNotNull("render_time")
        .whereRaw("DATE(render_finish_time ) = CURDATE()")
        .count("g.id as nr")
        .first();

    let left;

    switch (plan.plan_id) {
        case FREE_SUBSCRIPTION_PLAN_ID:
            left = 0;
            break;
        case BASIC_SUBSCRIPTION_PLAN_ID:
            left = 1 - number.nr;
            break;
        case PRO_SUBSCRIPTION_PLAN_ID:
            left = 10 - number.nr;
            break;
    }

    return { left };
}

export function updateChartLog(params, db) {
    const finishTime = moment();

    const duration = moment.duration(finishTime.diff(params.renderStartTime));

    db("graphs")
        .where({ user_id: params.user * 1, unique_id: params.unique_id }, {
            render_finish_time: finishTime.format(MYSQL_TIME_FORMAT),
            render_time: duration.asMinutes()
        })
        .update({
            render_start_time: params.renderStartTime.format(MYSQL_TIME_FORMAT),
            render_finish_time: finishTime.format(MYSQL_TIME_FORMAT),
            render_time: duration.asMinutes()
        })
        .then(res => console.log("Updated", res));
}

export function sendMail(to, subject, text) {
    transporter.sendMail({
            from: "Chartlapse <info@lorecore.com>",
            to,
            subject,
            text
        },
        (err, info) => {
            console.log(1, err);
            console.log(2, info);
            console.log(3, info);
        }
    );
}