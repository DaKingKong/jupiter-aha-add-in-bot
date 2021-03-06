const { AhaModel, ChangesModel } = require('../models/models')
const { ahaOAuth }        = require('../lib/aha')
const Bot                 = require('ringcentral-chatbot-core/dist/models/Bot').default;
let   Queue               = require('bull');

let REDIS_URL = process.env.REDIS_URL || 'redis://127.0.0.1:6379';
let JOB_DELAY = process.env.AGGREGATION_DELAY || 1000;

let   workQueue = new Queue('work', REDIS_URL);

const ahaOAuthHandler = async (req, res) => {
    const { state } = req.query
    const [groupId, botId, userId] = state.split(':')
    console.log(`Requesting installation of bot (id:${botId}) into chat (id:${groupId}) by user (id:${userId})`)

    const tokenUrl = `${process.env.RINGCENTRAL_CHATBOT_SERVER}${req.url}`;
    console.log(`Token URL: ${tokenUrl}`);
    const tokenResponse = await ahaOAuth.code.getToken(tokenUrl);
    const token = tokenResponse.data.access_token;
    console.log("Successfully obtained OAuth token")
    
    // Bearer token in hand. Now let's stash it.
    const query = { groupId, botId }
    const ahaModel = await AhaModel.findOne({ where: query })
    if (ahaModel) {
        await ahaModel.update({
            userId,
            token
        })
    } else {
        await AhaModel.create({ ...query, userId, token })
    }

    const bot = await Bot.findByPk(botId)
    // Test to see if token works
    //const r = await rc.get('/restapi/v1.0/account/~/extension/~')
    // Send user confirmation message
    await bot.sendMessage(groupId, { text: `Thank you. The Aha bot has been authorized to fetch data from Aha. Setup is complete.` })
}

const ahaWebhookHandler = async (req, res) => {
    const { groupId, botId } = req.query
    if (typeof groupId === "undefined" || typeof botId === "undefined") {
        console.log("Received a webhook but the group and bot IDs were empty. Something is wrong.")
        // TODO - communicate this to the user so they can fix. 
        res.send('<!doctype><html><body>OK</body></html>')
        return
    }
    console.log(`Received webhook from Aha (group: ${groupId}, bot: ${botId})...`)

    console.log( "Webhook content:", req.body )
    let audit = req.body.audit
    let webhook_data = JSON.stringify(audit, null, 2);
    if (audit.description.includes('added custom field for')) {
        audit.interesting = false
    }

    const bot = await Bot.findByPk(botId)
    if (bot) {
        if (audit.interesting) {
	    let jobId = `${audit.audit_action}:${audit.auditable_id}:${audit.auditable_type}`;

	    if (audit.audit_action == "update") {
		// Aha is a really noisy webhook engine, sending lots of individual webhooks for
		// changes related to a single feature.
		// Our strategy is to create a background job that is delayed by n minutes. That
		// job will aggregate all the changes related to the same aha entity and post a
		// single card for those changes.
		
		// Step 1. Store the received change in the database.
		console.log(`Storing changes for ${audit.auditable_type}, id: ${audit.auditable_id}`)
		let c = await ChangesModel.create({
		    'ahaType' : audit.auditable_type,
		    'ahaId'   : audit.auditable_id,
		    'data'    : webhook_data
		});
		
		// Step 2. Create a job if one does not already exist.
		let job = await workQueue.getJob(jobId);
		if (!job) {
		    console.log(`Creating job with delay of ${JOB_DELAY}ms: ${jobId}`);
		    job = await workQueue.add({
			'group_id' : groupId,
			'bot_id'   : botId,
			'action'   : audit.audit_action,
			'aha_id'   : audit.auditable_id,
			'aha_type' : audit.auditable_type
		    },{
			'jobId'           : jobId,
			'delay'           : JOB_DELAY,
			'removeOnComplete': true
		    });
		    console.log(`Job created: ${job.id}`);
		} else {
		    console.log(`Job already exists: ${job.id}. Skipping job creation.`);
		}
		
	    } else if (audit.audit_action == "create") {
		console.log("WORKER: create action triggered. creating job...");
		job = await workQueue.add({
		    'group_id' : groupId,
		    'bot_id'   : botId,
		    'action'   : audit.audit_action,
		    'aha_id'   : audit.auditable_id,
		    'aha_type' : audit.auditable_type,
		    'audit'    : audit
		},{
		    'jobId'           : jobId,
		    'removeOnComplete': true
		});
		console.log(`Job created: ${job.id}`);
	    }
	    console.log("Finished processing activity webhook from Aha")
        }
    }
}

// Comment from Da:
// This can be done easily with client-oauth2. Let me know when you want to do it. I can get this done in like 30min
/*
app.put('/aha/refresh-tokens', async (req, res) => {
    const services = await Service.findAll()
    for (const service of services) {
    aha.token(service.data.token)
    try {
        await rc.refresh()
    } catch (e) {
        console.error(e)
        if (e.data && /\btoken\b/i.test(e.data.message)) { // refresh token expired
        const bot = await Bot.findByPk(service.botId)
        await bot.sendMessage(service.groupId, { text: 'Authorization expired' })
        await sendAuthorizationLink({ id: service.groupId }, bot)
        await service.destroy()
        }
        continue
    }
    const token = rc.token()
    await service.update({
        data: {
        id: token.owner_id, token
        }
    })
    }
    res.send('')
})
*/

exports.ahaOAuthHandler = ahaOAuthHandler;
exports.ahaWebhookHandler = ahaWebhookHandler;
