# Jupiter Aha Add-In Bot

## Deploy to AWS (Lambda + Postgres)

We use [serverless framework](https://www.serverless.com/) as the main deployment tool, which utilizes YAML config files to define deployment parameters so to simply the process.

### Configure and Deploy

1. Rename `sample.serverless.yml` to `serverless.yml`, and `sample.env.yml` to `env.yml`
2. In `serverless.yml`, fill in `service: {service-name}` at the top, and `tags` (optional, delete `tags` if not needed).
3. In `env.yml`, fill in all empty fields, most of them are the same as in your local `.env` file. Make sure 2 `{DBUSERNAME}` and `{DBPASSWORD}` are replaced with the actual values.
4. In console, run `npm run serverless-build`.
5. Make sure you have your aws user credentials configured in your local environment. Do `npm run serverless-deploy`. (Note: it does install packages -> zip the project -> create AWS services and upload zip)
6. Go to [here](#configure-on-ringcentral-developer-portal) to create your bot instance.

### RDS Proxy

There has always been a problem to make serverless services work with RDS (the fact that serverless applications usually generate too many instances with database connections while RDS has been designed to handle low amount of connections at the same time.). AWS recently provide its RDS Proxy service as a solution to it.

We strongly suggest that you should add a RDS proxy in-between your lambda and RDS. Don't worry, it's pretty simple.

1. Refer to [this doc](https://aws.amazon.com/getting-started/hands-on/set-up-shared-database-connection-amazon-rds-proxy/)'s Step 3 to create an IAM role for your proxy accessing database secret
2. Go to AWS console -> Secret Manager -> `Store a new secret` -> Credentials for Amazon RDS database -> fill in `username` and `password` (same as in your `env.yml`) -> select your db -> input a name and `Next` -> `Next` -> `Store`
3. Go to AWS console -> RDS -> Proxies -> `Create Proxy`.
   1. `Identifier`: you could use the same name as your service's name
   2. `Engine`: PostgreSQL
   3. `Database`: choose the database you just created
   4. `Secrets Manager secret(s)`: choose the secret you just created
   5. `IAM Role`: choose the role you just created
   6. `Additional connectivity configuration` -> `Existing VPC security groups`: choose both db and lambda groups
   7. `Create Proxy`
4. To validate connectivity, in command line, do `aws rds describe-db-proxy-targets --db-proxy-name $DB_PROXY_NAME` (replace `$DB_PROXY_NAME` with your proxy name). A successful connection will return state as `AVAILABLE`.
5. Go to lambda service -> Configuration -> Database proxies -> Add your RDS proxy
6. Now go to [here](#configure-on-ringcentral-developer-portal) to create your bot instance.


## Deploy to Heroku

Fork this repo and click below button for your first time deployment. (Note: Heroku Button is to be used for the first time setup. Further changes are to be made on Heroku app web page)

[![Deploy](https://www.herokucdn.com/deploy/button.svg)](https://heroku.com/deploy)

Right after the deployment, make sure taking following steps to configure it:
1. Go to your app settings page on Heroku
3. Go to `Domains` section and copy your server url (do not include the last '/'). Let's call it `BotServerUrl`
2. Reveal Config Vars
3. Find `RINGCENTRAL_CHATBOT_SERVER` and edit it to be `BotServerUrl`
4. Find `DATABASE_URL` and copy its value. Put it onto `RINGCENTRAL_CHATBOT_DATABASE_CONNECTION_URI`

### Automate Deployment

1. Go to app's `Deploy` tab
2. In `Deployment method` section, connect it with your Github repo.
3. Enable `Automatic deploys`. It will then deploy upon every git push to your git remote repo.

## Configure on RingCentral Developer Portal

1. Create a `Bot Add-In` app
2. Go to your app's `Settings` tab on RingCentral Developer Portal
3. Find `OAuth Redirect URI` and fill it with `{BotSererUrl}/bot/oauth`
4. Go to `Bot` tab and click `Add to RingCentral` (Note: bot server url might not be updated right away. Please wait for a few minutes if it fails.)

Note: Aha server seems like using an internal polling mechanism which doesn't send the activity message right after the change. It feels like there's a 5min interval.

## Try on RingCentral Jupiter

Note: if bot's status is `In Sandbox`, then go to `https://app.devtest.ringcentral.com/`. Please also update `RINGCENTRAL_SERVER` in Heroku app env var config if switching between Sandbox and Production

Add the bot to a group chat and type `@{botName} help` or direct message the bot `help`.

## Further Development

### More Bot Commands

Have a look at `src/handlers/botHandler.js`, it's pretty straightforward.

### More Adaptive Cards

Adaptive card can be designed with [Adaptive Cards Designer](https://adaptivecards.io/designer/) where the json data in `CARD PAYLOAD EDITOR` can be save as `xxx.json` and stored under `src/adaptive-cards` folder. Please refer to existing use of `ahaCard.json` as example.
