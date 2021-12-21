const Bot = require('ringcentral-chatbot-core/dist/models/Bot').default;
const { AhaModel } = require('../models/ahaModel');

const { ahaOAuth } = require('../lib/aha')
const { AllHtmlEntities } = require('html-entities')
const turnDownService = require('turndown')
const { Template } = require('adaptivecards-templating')
const ahaCardTemplate = require('../adaptiveCards/ahaCard.json')

const entities = new AllHtmlEntities()
const turnDown = new turnDownService()

const ahaOAuthHandler = async (req, res) => {
    const { state } = req.query
    const [groupId, botId, userId] = state.split(':')

    const tokenResponse = await ahaOAuth.code.getToken(`${process.env.RINGCENTRAL_CHATBOT_SERVER}${req.url}`);
    const token = tokenResponse.data.access_token;

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
    await bot.sendMessage(groupId, { text: `I have been authorized to fetch data from Aha` })
}

const ahaWebhookHandler = async (req, res) => {
    const { groupId, botId } = req.query
    if (typeof groupId === "undefined" || typeof botId === "undefined") {
        console.log("Received a webhook but the group and bot IDs were empty. Something is wrong.")
        // TODO - communicate this to the user so they can fix. 
        res.send('<!doctype><html><body>OK</body></html>')
        return
    }
    let audit = req.body.audit
    console.log(`Received webhook from Aha (group: ${groupId}, bot: ${botId})...`)
    console.log(JSON.stringify(audit, null, 2))
    const bot = await Bot.findByPk(botId)
    if (audit.description.includes('added custom field for')) {
        audit.interesting = false
    }
    if (bot) {
        if (audit.interesting) {
            let changes = []
            let seen_fields = []
            for (var i in audit.changes) {
                let change = audit.changes[i]
                let ignore_fields = new RegExp('(Created by user|Rank|Assigned to user|Show feature remaining estimate|Reference num)')
                if (change.value == '' || // empty value
                    (ignore_fields.test(change.field_name) && audit.audit_action === "create") || // field to ignore
                    seen_fields.includes(change.field_name) // duplicate field
                ) {
                    continue
                }
                let shortDesc = "Short"
                if (change.field_name == "Name" ||
                    change.field_name == "Description" ||
                    change.field_name.includes('Comment by')) {
                    shortDesc = "Long"
                }
                let change_value = ''
                if (audit.auditable_type === "note" ||
                    change.field_name.includes("Comment by")) {
                    change_value = turnDown.turndown(change.value.toString())
                } else {
                    change_value = entities.decode(change.value.toString())
                }
                let change_instruction = {
                    "title": change.field_name,
                    "value": change_value,
                    "style": shortDesc
                }
                if (change.field_name === "Name") {
                    changes.splice(0, 0, change_instruction)
                } else if (change_value.trim().length > 0) {
                    // ignore if the change has no description or value
                    changes.push(change_instruction)
                }
                seen_fields.push(change.field_name)
            }
            // do not post a message if there are no changes to post about
            if (changes.length > 0) {
                if (audit.audit_action != "destroy") {
                    const cardData = {
                        actionTitle: `Aha ${audit.audit_action}`,
                        actionText: `The following fields were modified ${audit.auditable_url}`,
                        changes: changes,
                        footNote: `Changes made by ${audit.user.name}. ${audit.created_at}`
                    }
                    const template = new Template(ahaCardTemplate);
                    const card = template.expand({
                        $root: cardData
                    });
                    await bot.sendAdaptiveCard(groupId, card);
                }
            }
        }
    }
}


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