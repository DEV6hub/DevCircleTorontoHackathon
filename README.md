# Facebook Developer Circle Toronto Hackathon Seed Project

Follow these steps to get your team's bot configured and off the ground.

> Each team member must create a personal Facebook account and a Facebook developer account [here] (https://developers.facebook.com/) 

## Before you begin - team tasks

* Create a Facebook page [here] (https://www.facebook.com/pages/create) 
    * Choose Cause or Community as the page type
    * Use this format for the page name: ```Developer Circles Toronto Hack 2017 Team ##```
    * Add a page username using the same format: ```@Developer Circles Toronto Hack 2017 Team ##```
    * Configure your page's button: Add Button > Get in Touch > Send Message 
    * Bookmark your page and/or Pin to Favorites so you can find it later
    * Ensure all your team members are page admins
* Add a two-line comment on the [Hackathon Team Submissions thread] (https://www.facebook.com/groups/DevCToronto/search/?query=Hackathon%20Team%20Submissions) with your team's github repo url and page address

## Server Configuration - Part I
> these steps have no dependencies so complete them first
* Update config/default.json 
    * "fb_validationToken": "make up a short phrase to use when you validate your webhook in a later step",
    * "sh_shopName": "select the value that was assigned to your team",
    * "sh_apiKey": "select the value that was assigned to your team",
    * "sh_apiPassword": "select the value that was assigned to your team",

## Configure your Facebook application - Part I
> The App Dashboard is the admin panel for all your Facebook Platform integrations. Every app you create contains some unique values which are used to secure the communication channels between your bot, the Messenger Platform and the people who message your page. You must copy these values into your bot's config file.
* Create a Facebook application in the [App Dashboard] (https://developers.facebook.com/apps)
    * Copy the App Secret value from the App Dashboard 
* Update config/default.json 
    * "fb_appSecret": "the auto generated value for your app in the App Dashboard"
* Add and configure the Messenger product
    * App Dashboard > {Your App} > Add Product > Messenger > Token Generation > Page > {select your team's page}
    * Copy the generated value
* Update config/default.json 
    * "fb_pageAccessToken":  "the value generated in and copied from the App Dashboard"

## Start your server and ngrok tunnel
> You must run your server so that the Messenger Platform can verify that your webhook is available 
* Run `npm install` from the project root folder to install all dependencies
* Run `npm start` to start the node server
* Run `ngrok http 5000` to get a public URL to your node server. DO NOT CLOSE THIS WINDOW!!!
* Update config/default.json 
    * "host_url": "https://{your unique url}.ngrok.io"
    * If you close/restart the ngrok service, update this field with the new URL and restart the node server.
* Restart the node server to ensure that it reads and uses the new host_url config value

## Configure your Facebook application - Part II

* Configure the Webhooks product
    * App Dashboard > {Your App} > Messenger > Webhooks > Setup Webhooks
        * Callback URL:  https://{your unique url}.ngrok.io/webhook
            * If you close/restart the ngrok service, repeat this step with the new URL.
        * Verify token: use the value you defined for the fb_validationToken field in config/default.json 
        * Subscription fields: select messages and messaging_postbacks as a minimum
    * App Dashboard > {Your App} > Messenger > Webhooks > Select a Page... > {select your team's page} > Subscribe

## Test your bot
* Open your Facebook page 
* Click the Send Message button and tap the Get Started button
* Send a simple text message to your bot
> The message should be echoed back at you
* Send 'help' to your bot
> You should be presented with a message a button
* Tap the 'Get 3 products' button
> You should see a carousel with three cards, one for each product that was returned
