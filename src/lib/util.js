import nodemailer from "nodemailer";
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

const transporter = nodemailer.createTransport({
  sendmail: true,
  newline: "unix",
  path: "/usr/sbin/sendmail"
});

export function sendMail(to, subject, text) {
  transporter.sendMail(
    {
      from: "Chartlapse <mailer@chartlapse.com>",
      to,
      subject,
      text
    },
    (err, info) => {
      console.log(1, err);
      console.log(2, info.envelope);
      console.log(3, info.messageId);
    }
  );
}
