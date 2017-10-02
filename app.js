/*
 * Copyright 2016-present, Facebook, Inc.
 * All rights reserved.
 *
 * This source code is licensed under the license found in the
 * LICENSE file in the root directory of this source tree.
 *
 */

/* jshint node: true, devel: true */
'use strict';

const 
  bodyParser = require('body-parser'),
  config = require('config'),
  crypto = require('crypto'),
  express = require('express'),
  https = require('https'),  
  request = require('request'),
  Shopify = require('shopify-api-node');

var app = express();
app.set('port', process.env.PORT || 5000);
app.set('view engine', 'ejs');
app.use(bodyParser.json({ verify: verifyRequestSignature }));
app.use(express.static('public'));

/*
 * Open config/default.json and set your config values before running this code. 
 * You can also set them using environment variables.
 *
 */

// App Secret can be retrieved from the App Dashboard
const FB_APP_SECRET = (process.env.FB_APP_SECRET) ? 
  process.env.FB_APP_SECRET :
  config.get('fb_appSecret');

// Arbitrary value used to validate a webhook
const FB_VALIDATION_TOKEN = (process.env.FB_VALIDATION_TOKEN) ?
  (process.env.FB_VALIDATION_TOKEN) :
  config.get('fb_validationToken');

// Generate a page access token for your page from the App Dashboard
const FB_PAGE_ACCESS_TOKEN = (process.env.FB_PAGE_ACCESS_TOKEN) ?
  (process.env.FB_PAGE_ACCESS_TOKEN) :
  config.get('fb_pageAccessToken');

const SHOPIFY_SHOP_NAME = (process.env.SHOP_NAME) ? 
  process.env.SHOP_NAME :
  config.get('sh_shopName');  

const SHOPIFY_API_KEY = (process.env.SHOP_API_KEY) ? 
  process.env.SHOP_API_KEY :
  config.get('sh_apiKey');  

const SHOPIFY_API_PASSWORD = (process.env.SHOP_API_PASSWORD) ? 
  process.env.SHOP_API_PASSWORD :
  config.get('sh_apiPassword');  

// make sure that everything has been properly configured
if (!(FB_APP_SECRET && FB_VALIDATION_TOKEN && FB_PAGE_ACCESS_TOKEN && SHOPIFY_SHOP_NAME && SHOPIFY_API_KEY && SHOPIFY_API_PASSWORD)) {
  console.error("Missing config values");
  process.exit(1);
}

const shopify = new Shopify({
  shopName: SHOPIFY_SHOP_NAME,
  apiKey: SHOPIFY_API_KEY,
  password: SHOPIFY_API_PASSWORD
});


/*
 * Verify that the callback came from Facebook. Using the App Secret from 
 * your App Dashboard, we can verify the signature that is sent with each 
 * callback in the x-hub-signature field, located in the header.
 *
 * https://developers.facebook.com/docs/graph-api/webhooks#setup
 *
 */
function verifyRequestSignature(req, res, buf) {
  var signature = req.headers["x-hub-signature"];

  if (!signature) {
    // In DEV, log an error. In PROD, throw an error.
    console.error("Couldn't validate the signature.");
  } else {
    var elements = signature.split('=');
    var method = elements[0];
    var signatureHash = elements[1];

    var expectedHash = crypto.createHmac('sha1', FB_APP_SECRET)
                        .update(buf)
                        .digest('hex');

    if (signatureHash != expectedHash) {
      throw new Error("Couldn't validate the request signature.");
    }
  }
}

/*
 * Use your own validation token. Check that the token used in the Webhook 
 * setup is the same token used here.
 *
 */
app.get('/webhook', function(req, res) {
  if (req.query['hub.mode'] === 'subscribe' &&
      req.query['hub.verify_token'] === FB_VALIDATION_TOKEN) {
    console.log("[app.get] Validating webhook");
    res.status(200).send(req.query['hub.challenge']);
  } else {
    console.error("Failed validation. Make sure the validation tokens match.");
    res.sendStatus(403);          
  }  
});


/*
 * All callbacks for Messenger are POST-ed. They will be sent to the same
 * webhook. Be sure to subscribe your app to your page to receive callbacks
 * for your page. 
 * https://developers.facebook.com/docs/messenger-platform/product-overview/setup#subscribe_app
 *
 */
app.post('/webhook', function (req, res) {
  var data = req.body;

  // Make sure this is a page subscription
  if (data.object == 'page') {
    // entries may be batched so iterate over each one
    data.entry.forEach(function(pageEntry) {
      var pageID = pageEntry.id;
      var timeOfEvent = pageEntry.time;

      // iterate over each messaging event
      pageEntry.messaging.forEach(function(messagingEvent) {

        let propertyNames = [];
        for (var prop in messagingEvent) { propertyNames.push(prop)}
        console.log("[app.post] Webhook received a messagingEvent with properties: ", propertyNames.join());
        
        if (messagingEvent.message) {
          // someone sent a message
          receivedMessage(messagingEvent);

        } else if (messagingEvent.delivery) {
          // messenger platform sent a delivery confirmation
          receivedDeliveryConfirmation(messagingEvent);

        } else if (messagingEvent.postback) {
          // user replied by tapping one of our postback buttons
          receivedPostback(messagingEvent);

        } else {
          console.log("[app.post] Webhook is not prepared to handle this message.");

        }
      });
    });

    // Assume all went well.
    //
    // You must send back a 200, within 20 seconds, to let us know you've 
    // successfully received the callback. Otherwise, the request will time out.
    res.sendStatus(200);
  }
});

/*
 * Message Event
 *
 * This event is called when a message is sent to your page. The 'message' 
 * object format can vary depending on the kind of message that was received.
 * Read more at https://developers.facebook.com/docs/messenger-platform/webhook-reference/message-received
 * 
 */
function receivedMessage(event) {
  var senderID = event.sender.id;
  var pageID = event.recipient.id;
  var timeOfMessage = event.timestamp;
  var message = event.message;

  console.log("[receivedMessage] user (%d) page (%d) timestamp (%d) and message (%s)", 
    senderID, pageID, timeOfMessage, JSON.stringify(message));

  if (message.quick_reply) {
    console.log("[receivedMessage] quick_reply.payload (%s)", 
      message.quick_reply.payload);
    handleQuickReplyResponse(event);
    return;
  }

  var messageText = message.text;
  if (messageText) {

    var lcm = messageText.toLowerCase();
    switch (lcm) {
      // if the text matches any special keywords, handle them accordingly
      case 'help':
        sendHelpOptionsAsButtonTemplates(senderID);
        break;
      
      default:
        // otherwise, just echo it back to the sender
        sendTextMessage(senderID, messageText);
    }
  }
}

/*
 * Send a message with buttons that allow the user to select from 
 * three of the four features.
 *
 */
function sendHelpOptionsAsButtonTemplates(recipientId) {
  console.log("[sendHelpOptionsAsButtonTemplates] Sending the help options menu"); 
  var messageData = {
    recipient: {
      id: recipientId
    },
    message:{
      attachment:{
        type:"template",
        payload:{
          template_type:"button",
          text:"Click the button before to get a list of 3 of our products.",
          buttons:[
            {
              "type":"postback",
              "title":"Get 3 products",
              "payload":JSON.stringify({action: 'QR_GET_PRODUCT_LIST', limit: 3})
            }
            // limit of up to three buttons 
          ]
        }
      }
    }
  };

  callSendAPI(messageData);
}

/*
 * Someone tapped one of the Quick Reply buttons so 
 * respond with the appropriate content
 *
 */
function handleQuickReplyResponse(event) {
  var senderID = event.sender.id;
  var pageID = event.recipient.id;
  var message = event.message;
  var quickReplyPayload = message.quick_reply.payload;
  
  console.log("[handleQuickReplyResponse] Handling quick reply response (%s) from sender (%d) to page (%d) with message (%s)", 
    quickReplyPayload, senderID, pageID, JSON.stringify(message));
  
  // use branched conversation with one interaction per feature (each of which contains a variable number of content pieces)
  respondToHelpRequestWithTemplates(senderID, quickReplyPayload);
  
}

/*
 * This response uses templateElements to present the user with a carousel
 * You send ALL of the content for the selected feature and they can 
 * swipe from side to side to see it
 *
 */
function respondToHelpRequestWithTemplates(recipientId, requestForHelpOnFeature) {
  console.log("[respondToHelpRequestWithTemplates] handling help request for %s",
    requestForHelpOnFeature);
  var templateElements = [];

  var requestPayload = JSON.parse(requestForHelpOnFeature);

  // each button must be of type postback but title
  // and payload are variable depending on which 
  // set of options you want to provide
  var sectionButton = function(title, action, options) {
    var payload = options | {};
    payload = Object.assign(options, {action: action});
    return {
      type: 'postback',
      title: title,
      payload: JSON.stringify(payload)
    };
  }

  var textButton = function(title, action, options) {
    var payload = options | {};
    payload = Object.assign(options, {action: action});
    return {
      "content_type":"text",
      title: title,
      payload: JSON.stringify(payload)
    };
  }

  // Since there are only four options in total, we will provide 
  // buttons for each of the remaining three with each section. 
  // This provides the user with maximum flexibility to navigate

  switch (requestPayload.action) {
    case 'QR_GET_PRODUCT_LIST':
      var products = shopify.product.list({ limit: requestPayload.limit});
      products.then(function(listOfProducs) {
        listOfProducs.forEach(function(product) {
          templateElements.push({
            title: product.title,
            subtitle: product.tags,
            image_url: product.image.src,
            buttons: [
              sectionButton('Read description', 'QR_GET_PRODUCT_DESCRIPTION', {id: product.id})
            ]
          });
        });

        
        var messageData = {
          recipient: {
            id: recipientId
          },
          message: {
            attachment: {
              type: "template",
              payload: {
                template_type: "generic",
                elements: templateElements
              }
            }
          }
        };

        callSendAPI(messageData);

      });

      break;

    case 'QR_GET_PRODUCT_DESCRIPTION':
      var sh_product = shopify.product.get(requestPayload.id);
      sh_product.then(function(product) {
        var messageData = {
          recipient: {
            id: recipientId
          },
          message: {
            text: product.body_html.substring(0, 640),
            quick_replies: [
              textButton('Get 3 products', 'QR_GET_PRODUCT_LIST', {limit: 3})
            ]
          },
        };
        callSendAPI(messageData);
      });



      break;
  
  }

}

/*
 * Delivery Confirmation Event
 *
 * This event is sent to confirm the delivery of a message. Read more about 
 * these fields at https://developers.facebook.com/docs/messenger-platform/webhook-reference/message-delivered
 *
 */
function receivedDeliveryConfirmation(event) {
  var senderID = event.sender.id; // the user who sent the message
  var recipientID = event.recipient.id; // the page they sent it from
  var delivery = event.delivery;
  var messageIDs = delivery.mids;
  var watermark = delivery.watermark;
  var sequenceNumber = delivery.seq;

  if (messageIDs) {
    messageIDs.forEach(function(messageID) {
      console.log("[receivedDeliveryConfirmation] Message with ID %s was delivered", 
        messageID);
    });
  }

  console.log("[receivedDeliveryConfirmation] All messages before timestamp %d were delivered.", watermark);
}

/*
 * Postback Event
 *
 * This event is called when a postback is tapped on a Structured Message. 
 * https://developers.facebook.com/docs/messenger-platform/webhook-reference/postback-received
 * 
 */
function receivedPostback(event) {
  var senderID = event.sender.id;
  var recipientID = event.recipient.id;
  var timeOfPostback = event.timestamp;

  // The 'payload' param is a developer-defined field which is set in a postback 
  // button for Structured Messages. 
  var payload = event.postback.payload;

  console.log("[receivedPostback] from user (%d) on page (%d) with payload ('%s') " + 
    "at (%d)", senderID, recipientID, payload, timeOfPostback);

  respondToHelpRequestWithTemplates(senderID, payload);
}

/*
 * Send a text message using the Send API.
 *
 */
function sendTextMessage(recipientId, messageText) {
  var messageData = {
    recipient: {
      id: recipientId
    },
    message: {
      text: messageText, // utf-8, 640-character max
      metadata: "DEVELOPER_DEFINED_METADATA"
    }
  };

  callSendAPI(messageData);
}

/*
 * Call the Send API. The message data goes in the body. If successful, we'll 
 * get the message id in a response 
 *
 */
function callSendAPI(messageData) {
  request({
    uri: 'https://graph.facebook.com/v2.6/me/messages',
    qs: { access_token: FB_PAGE_ACCESS_TOKEN },
    method: 'POST',
    json: messageData

  }, function (error, response, body) {
    if (!error && response.statusCode == 200) {
      var recipientId = body.recipient_id;
      var messageId = body.message_id;

      if (messageId) {
        console.log("[callSendAPI] Successfully sent message with id %s to recipient %s", 
          messageId, recipientId);
      } else {
      console.log("[callSendAPI] Successfully called Send API for recipient %s", 
        recipientId);
      }
    } else {
      console.error("[callSendAPI] Send API call failed", response.statusCode, response.statusMessage, body.error);
    }
  });  
}

/*
 * Start server
 * Webhooks must be available via SSL with a certificate signed by a valid 
 * certificate authority.
 */
app.listen(app.get('port'), function() {
  console.log('[app.listen] Node app is running on port', app.get('port'));
});

module.exports = app;

