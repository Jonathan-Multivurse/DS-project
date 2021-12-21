const functions = require("firebase-functions");
const admin = require("firebase-admin");
admin.initializeApp(functions.config().firebase);

const db = admin.firestore();

exports.postNotification = functions
  .region("us-central1")
  .firestore
  .document("notification/{documentID}")
  .onCreate(async(snap, context) => {
    console.log("Push notification event was triggered on notification.");
    const newValue = snap.data();
    const title = newValue.title;
    const type = newValue.type;
    const message = newValue.message;
    const receivers = newValue.receivers;    

    if ( (type == 'submitted') || (type == 'received') || (type == 'cancelled') || (type == 'accepted') ) {
      return 
    } else {
      const payload = {
        "notification": {
          "title": title,
          "body": message,
          "sound": "default",
        },
        "data": {
          "type": type,
        },
      };

      const options = {
        priority: "high",
        mutableContent: true,
        contentAvailable: true,
      };

      return db
      .collection("users")
      .where('userid', 'in', receivers)
      .get()
      .then((querySnapshot) => {
          const tokens = [];
          querySnapshot.forEach((doc) => {
              tmpToken = doc.data().token
              if (tmpToken) {
                tokens.push(doc.data().token);
              }            
          });
          if (tokens.length > 0) {
            return admin.messaging().sendToDevice(tokens, payload);
          } else {
            return
          }          
      });
    }
});

exports.pushAccountNotification = functions
  .region("us-central1")
  .firestore
  .document("users/{documentID}")
  .onUpdate( async(change, context) => {
    console.log("Updating Company Account event was triggered on users.");    
    
    const oldValue = change.before.data();
    const oldAccept = oldValue.isAccept;
    const oldOnline = oldValue.online;

    const newValue = change.after.data();
    const senderId = newValue.userid;
    const firstname = newValue.firstname;
    const lastname = newValue.lastname;
    const time = newValue.updated;
    const newAccept = newValue.isAccept;
    const newOnline = newValue.online;

    const adminSnapshot = await db
    .collection('users')
    .where('type', '==', 'admin')
    .get();
    const adminId = adminSnapshot.docs[0].id;

    if (((oldAccept === '') || (oldAccept === 'pending')) && (newAccept === 'pending')) {
      const message = firstname + " " + lastname + " sent you request for a company representative account.";
      const dataAdmin = {          
        title: 'MeLiSA',
        type: 'repPending',
        message: message,
        time: time,
        sender: senderId,
        receivers: [adminId],
      }

      return db.collection('notification').add(dataAdmin)

    } else if ((oldAccept === 'pending') && (newAccept === 'accepted')){
      const messageSelf = "You accepted " + firstname + " " + lastname + "'s company representative request.";
      const dataSelf = {          
        title: 'MeLiSA',
        type: 'repAccepted',
        message: messageSelf,
        time: new Date().getTime(),
        sender: adminId,
        receivers: [adminId],
      }

      const messageRep = "Your request for company representative was accepted.";
      const dataRep = {          
        title: 'MeLiSA',
        type: 'repAccepted',
        message: messageRep,
        time: new Date().getTime(),
        sender: adminId,
        receivers: [senderId],
      }

      const batch = db.batch();
      var newDocSelf = db.collection('notification').doc();
      var newDocRep = db.collection('notification').doc();
      var newDocSelfRef = db.collection('notification').doc(newDocSelf.id);
      var newDocRepRef = db.collection('notification').doc(newDocRep.id);

      batch.set(newDocSelfRef, dataSelf);
      batch.set(newDocRepRef, dataRep);
      return batch.commit();

    }  else if ((oldAccept === 'pending') && (newAccept === 'declined')){

      const messageSelf = "You removed " + firstname + " " + lastname + " as a company representative.";
      const dataSelf = {          
        title: 'MeLiSA',
        type: 'repDeclined',
        message: messageSelf,
        time: new Date().getTime(),
        sender: adminId,
        receivers: [adminId],
      }

      const messageRep = "Your request for company representative was removed.";
      const dataRep = {          
        title: 'MeLiSA',
        type: 'repDeclined',
        message: messageRep,
        time: new Date().getTime(),
        sender: adminId,
        receivers: [senderId],
      }

      const batch = db.batch();
      var newDocSelf = db.collection('notification').doc();
      var newDocRep = db.collection('notification').doc();
      var newDocSelfRef = db.collection('notification').doc(newDocSelf.id);
      var newDocRepRef = db.collection('notification').doc(newDocRep.id);

      batch.set(newDocSelfRef, dataSelf);
      batch.set(newDocRepRef, dataRep);
      return batch.commit();        
    } else if ((oldAccept === 'accepted') && (oldOnline != newOnline)){    

      const messageSelf = "You updated availability status.";
      const dataSelf = {          
        title: 'MeLiSA',
        type: 'availability',
        message: messageSelf,
        time: new Date().getTime(),
        sender: senderId,
        receivers: [senderId],
      }

      const messageRep= firstname + " " + lastname + " has updated availability status.";
      const   dataRep= {          
        title: 'MeLiSA',
        type: 'availability',
        message: messageRep,
        time: new Date().getTime(),
        sender: senderId,
        receivers: [adminId],
      }

      const batch = db.batch();
      var newDocSelf = db.collection('notification').doc();
      var newDocRep = db.collection('notification').doc();
      var newDocSelfRef = db.collection('notification').doc(newDocSelf.id);
      var newDocRepRef = db.collection('notification').doc(newDocRep.id);

      batch.set(newDocSelfRef, dataSelf);
      batch.set(newDocRepRef, dataRep);
      return batch.commit();

    } else {
      return
    }
});

exports.pushRequestNotification = functions
  .region("us-central1")
  .firestore
  .document("request/{documentID}")
  .onWrite( async(change, context) => {
    console.log("Updating Request event was triggered on request."); 

    const oldValue = change.before.exists ? change.before.data() : null;  
    const oldStatus = change.before.exists ? oldValue.status : '';

    const newValue = change.after.exists ? change.after.data() : null;
    const type = newValue.type;
    const newStatus = newValue.status;
    const senderId = newValue.senderId;
    const sender = newValue.sender;
    const receiverId = newValue.receiverId;
    const receiver = newValue.receiver;
    const isSchedule = newValue.isSchedule;
    const scheduleTime = newValue.scheduleTime;
    const offset = newValue.offset;
    const time = newValue.time;
    
    const offsetseconds = offset * 60 * 60 * 1000;
    var dt = new Date(scheduleTime + offsetseconds)
    var months = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug', 'Sep','Oct','Nov','Dec'];           
    var month = dt.getUTCMonth();
    var monthString = months[month];
    var day = dt.getUTCDate();
    var hour = dt.getUTCHours();
    var hourString = (hour == 0) ? "12 AM" : (hour < 12) ?  hour.toString() + " AM" : (hour == 12) ? "12 PM" : (hour - 12).toString() + " PM"

    const senderName = sender.firstname + " " + sender.lastname;
    const receiverName = receiver.firstname + " " + receiver.lastname;

    const receiversSnapshot = await db
    .collection("users")
    .where('type', '!=', 'customer')
    .get();
    const receriverIds = receiversSnapshot.docs.map(doc => doc.id);  

    const adminSnapshot = await db
    .collection('users')
    .where('type', '==', 'admin')
    .get();
    const adminId = adminSnapshot.docs[0].id;

    if ((oldStatus === '') && (newStatus === 'pending')) {
      const messageCustomer = (isSchedule === true) ? "A meeting request at " + hourString + " on " + monthString + " " +  day.toString() + " is submitted." : "Your support request is submitted.";
      const dataCustomer = {          
        title: 'MeLiSA',
        type: 'submitted',
        message: messageCustomer,
        time: new Date().getTime(),
        sender: senderId,
        receivers: [senderId]
      };
        
      const messageRep = (isSchedule === true) ? senderName + " is requesting a support at " + hourString + " on " + monthString + " " +  day.toString() + "." : senderName + " is requesting support."; 
      const dataRep = {          
        title: 'MeLiSA',
        type: 'received',
        message: messageRep,
        time: new Date().getTime(),
        sender: senderId,
        receivers: receriverIds,
      };

      const batch = db.batch();
      var newDocCustomer = db.collection('notification').doc();
      var newDocRep = db.collection('notification').doc();
      var newDocCustomerRef = db.collection('notification').doc(newDocCustomer.id);
      var newDocRepRef = db.collection('notification').doc(newDocRep.id);
      batch.set(newDocCustomerRef, dataCustomer);
      batch.set(newDocRepRef, dataRep);
      return batch.commit();

    } else if ((oldStatus === 'pending') && (newStatus === 'cancelled')) {
      const messageCustomer = (isSchedule === true) ? "A meeting request at " + hourString + " on " + monthString + " " +  day.toString() + " was cancelled." : "Your support request was cancelled.";
      const dataCustomer = {          
        title: 'MeLiSA',
        type: 'cancelled',
        message: messageCustomer,
        time: new Date().getTime(),
        sender: senderId,
        receivers: [senderId]
      };
      
      const messageRep = (isSchedule === true) ? senderName + " cancelled the support scheduled at " + hourString + " on " + monthString + " " +  day.toString() + "." : senderName + " cancelled the support.";
      const dataRep = {          
        title: 'MeLiSA',
        type: 'cancelled',
        message: messageRep,
        time: new Date().getTime(),
        sender: senderId,
        receivers: receriverIds,
      };

      const batch = db.batch();
      var newDocCustomer = db.collection('notification').doc();
      var newDocRep = db.collection('notification').doc();
      var newDocCustomerRef = db.collection('notification').doc(newDocCustomer.id);
      var newDocRepRef = db.collection('notification').doc(newDocRep.id);
      batch.set(newDocCustomerRef, dataCustomer);
      batch.set(newDocRepRef, dataRep);
      return batch.commit();

    } else if ((oldStatus === 'pending' ) && (newStatus === 'scheduled')) {

      const messageCustomer = "Your support request at "+ hourString + " on " + monthString + " " +  day.toString() + " is scheduled by " + receiverName;          
      const dataCustomer = {          
        title: 'MeLiSA',
        type: 'accepted',
        message: messageCustomer,
        time: new Date().getTime(),
        sender: receiverId,
        receivers: [senderId],
      };
      
      const messageRep = (isSchedule === true) ? "You scheduled " + senderName + "'s support request at " + hourString + " on " + monthString + " " +  day.toString() + "." : "You accepted " + senderName + "'s support request.";
      const dataRep = {          
        title: 'MeLiSA',
        type: 'accepted',
        message: messageRep,
        time: new Date().getTime(),
        sender: receiverId,
        receivers: [receiverId]
      };       

      const messageAdmin = senderName + "'s support request is scheduled by " + receiverName;          
      const dataAdmin = {          
        title: 'MeLiSA',
        type: 'accepted',
        message: messageAdmin,
        time: new Date().getTime(),
        sender: receiverId,
        receivers: [adminId],
      };

      const batch = db.batch();
      var newDocCustomer = db.collection('notification').doc();
      var newDocRep = db.collection('notification').doc();
      var newDocAdmin = db.collection('notification').doc();
      var newDocCustomerRef = db.collection('notification').doc(newDocCustomer.id);
      var newDocRepRef = db.collection('notification').doc(newDocRep.id);
      var newDocAdminpRef = db.collection('notification').doc(newDocAdmin.id);
      batch.set(newDocCustomerRef, dataCustomer);
      batch.set(newDocRepRef, dataRep);
      batch.set(newDocAdminpRef, dataAdmin);
      return batch.commit();

    } else if ((oldStatus === 'pending' || oldStatus === 'assigned' ) && (newStatus === 'accepted')) {

      const messageCustomer = "Your support request is accepted by " + receiverName;          
      const dataCustomer = {          
        title: 'MeLiSA',
        type: 'accepted',
        message: messageCustomer,
        time: new Date().getTime(),
        sender: receiverId,
        receivers: [senderId],
      };
      
      const messageRep = "You accepted " + senderName + "'s support request.";
      const dataRep = {          
        title: 'MeLiSA',
        type: 'accepted',
        message: messageRep,
        time: new Date().getTime(),
        sender: receiverId,
        receivers: [receiverId]
      };       

      const messageAdmin = senderName + "'s support request is accepted by " + receiverName;          
      const dataAdmin = {          
        title: 'MeLiSA',
        type: 'accepted',
        message: messageAdmin,
        time: new Date().getTime(),
        sender: receiverId,
        receivers: [adminId],
      };

      const batch = db.batch();
      var newDocCustomer = db.collection('notification').doc();
      var newDocRep = db.collection('notification').doc();
      var newDocAdmin = db.collection('notification').doc();
      var newDocCustomerRef = db.collection('notification').doc(newDocCustomer.id);
      var newDocRepRef = db.collection('notification').doc(newDocRep.id);
      var newDocAdminpRef = db.collection('notification').doc(newDocAdmin.id);
      batch.set(newDocCustomerRef, dataCustomer);
      batch.set(newDocRepRef, dataRep);
      batch.set(newDocAdminpRef, dataAdmin);
      return batch.commit();

    }  else if ((oldStatus === 'accepted' || oldStatus === 'addedColleague') && (newStatus === 'completed')) {
      const messageCustomer = 'You ended the support session with ' + receiverName + ".";
      const dataCustomer = {          
        title: 'MeLiSA',
        type: (type === 'Chat') ? 'endedChat' : 'endedCall',
        message: messageCustomer,
        time: new Date().getTime(),
        sender: receiverId,
        receivers: [senderId]
      };
      
      const messageRep = senderName +' ended the support session.';            
      const dataRep = {          
        title: 'MeLiSA',
        type: (type === 'Chat') ? 'endedChat' : 'endedCall',
        message: messageRep,
        time: new Date().getTime(),
        sender: senderId,
        receivers: [receiverId],
      };

      const messageAdmin = senderName + " ended the support session with " + receiverName + ".";          
      const dataAdmin = {          
        title: 'MeLiSA',
        type: (type === 'Chat') ? 'endedChat' : 'endedCall',
        message: messageAdmin,
        time: new Date().getTime(),
        sender: senderId,
        receivers: [adminId],
      };

      const batch = db.batch();
      var newDocCustomer = db.collection('notification').doc();
      var newDocRep = db.collection('notification').doc();
      var newDocAdmin = db.collection('notification').doc();
      var newDocCustomerRef = db.collection('notification').doc(newDocCustomer.id);
      var newDocRepRef = db.collection('notification').doc(newDocRep.id);
      var newDocAdminpRef = db.collection('notification').doc(newDocAdmin.id);
      batch.set(newDocCustomerRef, dataCustomer);
      batch.set(newDocRepRef, dataRep);
      batch.set(newDocAdminpRef, dataAdmin);
      return batch.commit();

    } else {
      return
    }       
});   

exports.pushSurveyNotification = functions
  .region("us-central1")
  .firestore
  .document("survey/{documentID}")
  .onWrite( async(change, context) => {
    console.log("Updating Survey event was triggered on survey."); 

    const oldValue = change.before.exists ? change.before.data() : null;  
    const oldStatus = change.before.exists ? oldValue.status : -1;
    const oldSubmissions = change.before.exists ? oldValue.submissions : 0;

    const newValue = change.after.exists ? change.after.data() : null;
    const newStatus = change.after.exists ? newValue.status : -1;
    const newTitle = change.after.exists ? newValue.title : '';      
    const newSurveyId = change.after.exists ? newValue.surveyId : '';
    const newSubmissions = change.after.exists ? newValue.submissions : 0;

    const adminSnapshot = await db
    .collection('users')
    .where('type', '==', 'admin')
    .get();
    const adminId = adminSnapshot.docs[0].id;

    const customersSnapshot = await db
    .collection("users")
    .where('type', '==', 'customer')
    .get();
    const customerIds = customersSnapshot.docs.map(doc => doc.id);  
    
    if ((oldStatus === 0) && (newStatus === 1)) {
      const messageCustomer = "Please fill a " + newTitle + " form."; 
      const dataCustomer = {          
        title: 'MeLiSA',
        type: 'survey',
        message: messageCustomer,
        time: new Date().getTime(),
        sender: adminId,
        receivers: customerIds,
        survey: newSurveyId,
      };

      const messageAdmin = newTitle + " is posted.";
      const dataAdmin = {          
        title: 'MeLiSA',
        type: 'survey',
        message: messageAdmin,
        time: new Date().getTime(),
        sender: adminId,
        receivers: [adminId],
        survey: newSurveyId,
      };
      
      const batch = db.batch();
      var newDocCustomer = db.collection('notification').doc();
      var newDocAdmin = db.collection('notification').doc();
      var newDocCustomerRef = db.collection('notification').doc(newDocCustomer.id);
      var newDocAdminpRef = db.collection('notification').doc(newDocAdmin.id);
      batch.set(newDocCustomerRef, dataCustomer);
      batch.set(newDocAdminpRef, dataAdmin);
      return batch.commit();

    } else if ((oldStatus === 1) && (newStatus === 1) && (oldSubmissions === newSubmissions)) {
      const messageCustomer = "Please fill a " + newTitle + " form."; 
      const dataCustomer = {          
        title: 'MeLiSA',
        type: 'survey',
        message: messageCustomer,
        time: new Date().getTime(),
        sender: adminId,
        receivers: customerIds,
        survey: newSurveyId,
      };

      const batch = db.batch();
      var newDocCustomer = db.collection('notification').doc();
      var newDocCustomerRef = db.collection('notification').doc(newDocCustomer.id);
      batch.set(newDocCustomerRef, dataCustomer);
      return batch.commit();

    } else {
      return
    }       
});   

exports.getRequests = functions.https.onRequest( async (request, response) => {
  var requests = [];
  var scRequests = [];
  var unscRequests = [];

  try {
    const snapshot = await db
    .collection('request')
    // .where('status', '==', 'pending')
    .orderBy('scheduleTime')
    .get();

    if (!snapshot.empty) {
      snapshot.forEach(request => {
        if( (request.data().status === 'cancelled') || (request.data().status === 'completed') ){        
        } else {
          requests.push({...request.data()});
        }  
      });
  
      requests.forEach(request => {
        if (request.isSchedule == true) {        
          scRequests.push(request);
        } else {
          unscRequests.push(request);
        }
      });
    }

    return response.send({
      statusCode: 200,
      scheduled: scRequests,
      unscheduled: unscRequests,
    });

  } catch (err) {
    return response.send({
      statusCode: 404,
      error: err,
    });
  }
});

exports.getAdminRequests = functions.https.onRequest( async (request, response) => {
  var requests = [];
  var scRequests = [];
  var unscRequests = [];

  try {
    const snapshot = await db
    .collection('request')
    .orderBy('scheduleTime')
    .get();

    if (!snapshot.empty) {
      snapshot.forEach(request => {
        if( (request.data().status === 'cancelled') || (request.data().status === 'completed') ){        
        } else {
          requests.push({...request.data()});
        }      
      });

      requests.forEach(request => {       
        if (request.isSchedule == true) {   
          scRequests.push(request)
        } else {
          unscRequests.push(request)
        }
      });
    }

    return response.send({
      statusCode: 200,
      scheduled: scRequests,
      unscheduled: unscRequests,
    });
  } catch (err) {
    return response.send({
      statusCode: 404,
      error: err,
    });
  }
});

exports.getNotifications = functions.https.onRequest( async (request, response) => {
  const receiverId = request.body.userid;

  var promises = [];
  var promisesRequest = [];
  var notifications = [];
  var targets = [];

  try {
    const snapshot = await db
    .collection('notification')
    .where('receivers', 'array-contains', receiverId)
    .orderBy('time', 'desc')
    .limit(100)
    .get();

    if (!snapshot.empty) {
      snapshot.forEach(notification => {
        notifications.push({...notification.data(), notificationId: notification.id });
        promises.push(db.collection("users").doc(notification.data().sender).get())
        if (notification.data().request) {
          promisesRequest.push(db.collection("request").doc(notification.data().request).get())
        }
      });
  
      var users = await Promise.all(promises);
      var requests = await Promise.all(promisesRequest);

      notifications.forEach(notification => {
        var tmpusers = users.filter(item => item.data().userid === notification.sender);
  
        if (tmpusers.length > 0){
          if (notification.request) {
            var tmprequests = []
            if (requests.length > 0 ){
              tmprequests = requests.filter(item => item.data().requestid == notification.request)
            }

            if (tmprequests.length > 0) {
              targets.push({notification: notification, sender: tmpusers[0].data(), request: tmprequests[0].data()});
            } else {
              targets.push({notification: notification, sender: tmpusers[0].data(), request: null});
            }

          } else {
            targets.push({notification: notification, sender: tmpusers[0].data(), request: null});
          }      
        }      
      });
    }

    return response.send({
      statusCode: 200,
      notifications: targets,
    });

  } catch (err) {
    return response.send({
      statusCode: 404,
      error: err,
    });
  }
});

exports.deleteNotifications = functions.https.onRequest( async (request, response) => {
  const receiverId = request.body.userid;
  const notiicatinIds = request.body.notifications;

  try {
    var promises = [];
    notiicatinIds.forEach(notificationId => {
      promises.push(db.collection("notification").doc(notificationId).get())
    });

    var notifications = await Promise.all(promises);

    const batch = db.batch();
    notifications.forEach(notificationDoc => {
      var documentData = notificationDoc.data()
      var receivers = documentData.receivers
      if (receivers.includes(receiverId)) {
        const index = receivers.indexOf(receiverId)
        receivers.splice(index, 1);
      } 

      documentData.receivers = receivers
      batch.update(notificationDoc.ref, {"receivers": receivers})
    });

    batch.commit();

    return response.send({
      statusCode: 200,
    });

  } catch (err) {
    return response.send({
      statusCode: 404,
      error: err,
    });
  }
});

exports.writeRating = functions.https.onRequest( async (request, response) => {
  const senderId = request.body.userid;
  const receiverId = request.body.receiverid;
  const star = request.body.rating;
  const review = request.body.comment;
  const requestId = request.body.requestid;

  try {
    const senderDoc = await db
    .collection("users")
    .doc(senderId)    
    .get();
    const senderName = senderDoc.data().firstname + " " + senderDoc.data().lastname;

    const receiverDoc = await db
    .collection("users")
    .doc(receiverId)    
    .get();
    const receiverName = receiverDoc.data().firstname + " " + receiverDoc.data().lastname;

    const adminSnapshot = await db
    .collection('users')
    .where('type', '==', 'admin')
    .get();
    const adminId = adminSnapshot.docs[0].id;

    const ratingDoc = await db
    .collection('rating')
    .doc(receiverId)    
    .get();
    
    var receiverRatings = []
    if (ratingDoc.exists){

      if (ratingDoc.data().rating){
        receiverRatings = ratingDoc.data().rating;
      }
      receiverRatings.push({'requestId': requestId, 'review': review, 'star': star, 'writerId': senderId, 'writerName': senderName, 'time': new Date().getTime()})     

      await db
      .collection("rating")
      .doc(receiverId)
      .update({'rating': receiverRatings})
      .then(() => {
        console.log("Rating & Review was posted successfully!")
      });      
    } else {
      receiverRatings.push({'requestId': requestId,'review': review, 'star': star, 'writerId': senderId, 'writerName': senderName, 'time': new Date().getTime()})

      await db
      .collection("rating")
      .doc(receiverId)
      .set({'rating': receiverRatings})
      .then(() => {
        console.log("Rating & Review was posted successfully!")
      });      
    }
      const messageCustomer = "Thank you for submitting a ratings to " + receiverName + ".";
      const dataCustomer = {          
        title: 'MeLiSA',
        type: 'submitting',
        message: messageCustomer,
        time: new Date().getTime(),
        sender: senderId,
        receivers: [senderId]
      };
      
      const messageRep = senderName + " gave you the ratings.";          
      const dataRep = {          
        title: 'MeLiSA',
        type: 'submitting',
        message: messageRep,
        time: new Date().getTime(),
        sender: senderId,
        receivers: [receiverId],
      };

      const messageAdmin = receiverName + " received a rating & review from " + senderName + ".";          
      const dataAdmin = {          
        title: 'MeLiSA',
        type: 'submitting',
        message: messageAdmin,
        time: new Date().getTime(),
        sender: senderId,
        receivers: [adminId],
      };

      const batch = db.batch();
      var newDocCustomer = db.collection('notification').doc();
      var newDocRep = db.collection('notification').doc();
      var newDocAdmin = db.collection('notification').doc();
      var newDocCustomerRef = db.collection('notification').doc(newDocCustomer.id);
      var newDocRepRef = db.collection('notification').doc(newDocRep.id);
      var newDocAdminpRef = db.collection('notification').doc(newDocAdmin.id);
      batch.set(newDocCustomerRef, dataCustomer);
      batch.set(newDocRepRef, dataRep);
      batch.set(newDocAdminpRef, dataAdmin);
      batch.commit();

      return response.send({
        statusCode: 200,
      });

  } catch (err) {
    return response.send({
      statusCode: 404,
      error: err,
    });
  }
});

exports.askRating = functions.https.onRequest( async (request, response) => {
  const senderId = request.body.senderid;
  const receiverId = request.body.receiverid;
  const senderName = request.body.sendername;
  const receiverName = request.body.receivername;
  const requestId = request.body.requestid;

  try {

    const messageCustomer = receiverName + " has asked you to give the ratings.";
    const dataCustomer = {          
      title: 'MeLiSA',
      type: 'received',
      message: messageCustomer,
      time: new Date().getTime(),
      sender: receiverId,
      receivers: [senderId],
      request: requestId
    };
      
    // const messageRep = senderName + " gave you the ratings.";          
    // const dataRep = {          
    //   title: 'MeLiSA',
    //   type: 'submitting',
    //   message: messageRep,
    //   time: new Date().getTime(),
    //   sender: senderId,
    //   receivers: [receiverId],
    // };

    const batch = db.batch();
    var newDocCustomer = db.collection('notification').doc();
    // var newDocRep = db.collection('notification').doc();
    var newDocCustomerRef = db.collection('notification').doc(newDocCustomer.id);
    // var newDocRepRef = db.collection('notification').doc(newDocRep.id);
    batch.set(newDocCustomerRef, dataCustomer);
    // batch.set(newDocRepRef, dataRep);

    batch.commit();

    return response.send({
      statusCode: 200,
    });
    
  } catch (err) {
    return response.send({
      statusCode: 404,
      error: err,
    });
  }
});

exports.getSupports = functions.https.onRequest( async (request, response) => {
  const senderId = request.body.userid;

  var requests = [];
  var scRequests = [];
  var activeSessions = [];
  var closedSessions = [];

  try {
    const snapshot = await db
    .collection('request')
    .where('senderId', '==', senderId)
    .orderBy('scheduleTime', 'desc')
    .get();

    if (!snapshot.empty) {
      snapshot.forEach(request => {
        if (request.data().status != 'cancelled') {
          requests.push({...request.data()});
        }      
      });

      let today = new Date()
      requests.forEach(request => { 
        if ((request.status == 'pending' || request.status == 'scheduled') && (request.isSchedule == true) && (request.scheduleTime > today.getTime())) {
          scRequests.push(request);
        } else if (request.status == 'completed') {
          closedSessions.push(request);
        } else {
          activeSessions.push(request);
        }
      });
    }

    return response.send({
      statusCode: 200,
      request: requests,
      scheduled: scRequests,
      active: activeSessions,
      closed: closedSessions
    });

  } catch (err) {
    return response.send({
      statusCode: 404,
      error: err,
    });
  }
});

exports.getCompanySupports = functions.https.onRequest( async (request, response) => {
  const receiverId = request.body.userid;

  var requests = [];
  var scRequests = [];
  var activeSessions = [];
  var closedSessions = [];

  try {
    const snapshot = await db
    .collection('request')
    .where('receiverId', '==', receiverId)
    .orderBy('scheduleTime', 'desc')
    .get();

    if (!snapshot.empty) {
      snapshot.forEach(request => {
        if ( request.data().status != 'cancelled' )  {
          requests.push({...request.data()});
        }
      });

      let today = new Date()

      requests.forEach(request => {
  
        if ((request.status == 'scheduled') && (request.isSchedule == true) && (request.scheduleTime > today.getTime())) { 
          scRequests.push(request);
        } else if (request.status == 'completed') { 
          closedSessions.push(request);
        } else { 
          activeSessions.push(request);
        }          
      });
    }

    return response.send({
      statusCode: 200,
      request: requests,
      scheduled: scRequests,
      active: activeSessions,
      closed: closedSessions
    });

  } catch (err) {
    return response.send({
      statusCode: 404,
      error: err,
    });
  }
});

exports.getAdminSupports = functions.https.onRequest( async (request, response) => {
  
  var requests = [];
  var comUsers = [];  
  var pendingUsers = [];
  var activeUsers = [];

  try {
    let currentMiliSeconds = new Date().getTime() - 8 * 60 * 60 * 1000;

    const snapshotRequest = await db
    .collection("request")
    .where('status', '==', 'accepted')
    .where('scheduleTime', '>', currentMiliSeconds)
    .orderBy('scheduleTime', 'desc')
    .get();

    if (!snapshotRequest.empty) {
      snapshotRequest.forEach(request => {
        requests.push({...request.data()});
      });
    } 

    const snapshotUser = await db
    .collection("users")
    .where('type', '!=', 'admin')
    .get();    

    if (!snapshotUser.empty) {
      snapshotUser.forEach(user => {
        if (user.data().type == 'company') {
          if (user.data().isAccept == 'accepted') {
            comUsers.push({...user.data()});
          } else if (user.data().isAccept == 'pending') {
            pendingUsers.push({...user.data()});
          }
        }   
      });

      comUsers.forEach(user => {
        if (requests.length > 0) {
          var tmpRequests = requests.filter(item => item.receiverId === user.userid);
  
          if (tmpRequests.length > 0 ){ 
            activeUsers.push({request: tmpRequests[0], receiver: user})
          } else {
            activeUsers.push({request: null, receiver: user})
          }
        } else {
          activeUsers.push({request: null, receiver: user})
        }      
      })
    }

    return response.send({
      statusCode: 200,
      accepted: activeUsers,
      pending: pendingUsers,
    });

  } catch (err) {
    return response.send({
      statusCode: 404,
      error: err,
    });
  }
});

exports.getReps = functions.https.onRequest( async (request, response) => {
  const repId = request.body.userid;
  
  var requests = [];
  var comUsers = [];  
  var idleUsers = [];

  try {
    let currentMiliSeconds = new Date().getTime() - 60 * 60 * 1000;

    const snapshotRequest = await db
    .collection("request")
    .where('status', '==', 'accepted')
    .where('scheduleTime', '>', currentMiliSeconds)
    .orderBy('scheduleTime', 'desc')
    .get();

    if (!snapshotRequest.empty) {
      snapshotRequest.forEach(request => {
        requests.push({...request.data()});
      });
    }    

    const snapshotUser = await db
    .collection("users")
    .where('type', '==', 'company')
    .get();

    if (!snapshotUser.empty) {
      snapshotUser.forEach(user => {
        if ( user.data().isAccept == 'accepted' && user.data().userid != repId ) {
          comUsers.push({...user.data()});
        } 
      });

      comUsers.forEach(user => {
        if (requests.length > 0) {
          var tmpRequests = requests.filter(item => item.receiverId === user.userid);
  
          if (tmpRequests.length == 0 ){
            idleUsers.push(user)
          }
        } else {
          idleUsers.push(user)
        }      
      })
    }

    return response.send({
      statusCode: 200,
      reps: comUsers,
      ideals: idleUsers,
    });
  } catch (err) {    
    return response.send({
      statusCode: 404,
      error: err,
    });
  }
});

exports.getCompanyReps = functions.https.onRequest( async (request, response) => {
  const adminId = request.body.userid;
  
  var requests = [];
  var comUsers = [];  
  var idleUsers = [];

  try {
    let currentMiliSeconds = new Date().getTime() - 60 * 60 * 1000;

    const snapshotRequest = await db
    .collection("request")
    .where('status', '==', 'accepted')
    .where('scheduleTime', '>', currentMiliSeconds)
    .orderBy('scheduleTime', 'desc')
    .get();

    if (!snapshotRequest.empty) {
      snapshotRequest.forEach(request => {
        requests.push({...request.data()});
      });
    }    

    const snapshotUser = await db
    .collection("users")
    .where('type', '==', 'company')
    .get();

    if (!snapshotUser.empty) {
      snapshotUser.forEach(user => {
        if ( user.data().isAccept == 'accepted') {
          comUsers.push({...user.data()});
        } 
      });

      comUsers.forEach(user => {
        if (requests.length > 0) {
          var tmpRequests = requests.filter(item => item.receiverId === user.userid);
  
          if (tmpRequests.length == 0 ){
            idleUsers.push(user)
          }
        } else {
          idleUsers.push(user)
        }      
      })
    }

    return response.send({
      statusCode: 200,
      reps: comUsers,
      ideals: idleUsers,
    });
  } catch (err) {    
    return response.send({
      statusCode: 404,
      error: err,
    });
  }
});

exports.getFullReps = functions.https.onRequest( async (request, response) => {
  const adminId = request.body.userid;
  
  var ratings = [];
  var comUsers = []; 
  try {
    const snapshotRating = await db
    .collection("rating")
    .get();
    if (!snapshotRating.empty) {
      snapshotRating.forEach(rating => {
        ratings.push({...rating.data(), ratingId: rating.id });
      });
    }

    const snapshotUser = await db
    .collection("users")
    .where('type', '==', 'company')
    .get();

    if (!snapshotUser.empty) {
      snapshotUser.forEach(user => {
        if ( user.data().isAccept == 'accepted') {

          if (ratings.length > 0) {
            var tmpRatings = ratings.filter(item => item.ratingId === user.data().userid);
            if (tmpRatings.length > 0 ){
              comUsers.push({...user.data(), rating: tmpRatings[0].rating })
            } else {
              comUsers.push({...user.data()})
            }
          } else {
            comUsers.push({...user.data()})
          }
        }
      });
    }

    return response.send({
      statusCode: 200,
      reps: comUsers,
    });

  } catch (err) {    
    return response.send({
      statusCode: 404,
      error: err,
    });
  }
});

exports.acceptRequest = functions.https.onRequest( async (request, response) => {
  const requestId = request.body.requestid;
  const receiverId = request.body.receiverid;

  try {
    const receiverDoc = await db
    .collection("users")
    .doc(receiverId)    
    .get();
    
    await db
    .collection("request")
    .doc(requestId)
    .update({'status': 'accepted', 'receiverId': receiverId, 'receiver': receiverDoc.data()})
    .then(() => {
      return response.send({
        statusCode: 200,
      });
    })    
  } catch (err) {    
    return response.send({
      statusCode: 404,
      error: err,
    });
  }
});


exports.scheduleRequest = functions.https.onRequest( async (request, response) => {
  const requestId = request.body.requestid;
  const receiverId = request.body.receiverid;

  try {
    const receiverDoc = await db
    .collection("users")
    .doc(receiverId)    
    .get();
    
    await db
    .collection("request")
    .doc(requestId)
    .update({'status': 'scheduled', 'receiverId': receiverId, 'receiver': receiverDoc.data()})
    .then(() => {
      return response.send({
        statusCode: 200,
      });
    })    
  } catch (err) {    
    return response.send({
      statusCode: 404,
      error: err,
    });
  }
});

exports.assignSupport = functions.https.onRequest( async (request, response) => {
  const requestId = request.body.requestid;
  const senderName = request.body.sendername;    
  const receiverId = request.body.receiverid;
  const adminId = request.body.adminid;
  
  try {
    const receiverDoc = await db
    .collection("users")
    .doc(receiverId)    
    .get();
    const receiverName = receiverDoc.data().firstname + " " + receiverDoc.data().lastname;

    await db
    .collection("request")
    .doc(requestId)
    .update({'status': "assigned", 'receiverId': receiverId, 'receiver': receiverDoc.data()})
    .then(() => {      
      const messageRep = "A support request from " + senderName + " is assigned to you.";          
      const dataRep = {          
        title: 'Request Assigned',
        type: 'assign',
        message: messageRep,
        time: new Date().getTime(),
        sender: adminId,
        receivers: [receiverId],
        request: requestId,
      };

      const messageAdmin = "A support request by " + senderName + " is assigned to " + receiverName + ".";         
      const dataAdmin = {          
        title: 'Request Assigned',
        type: 'assign',
        message: messageAdmin,
        time: new Date().getTime(),
        sender: adminId,
        receivers: [adminId],
        request: requestId,
      };

      const batch = db.batch();
      var newDocRep = db.collection('notification').doc();
      var newDocAdmin = db.collection('notification').doc();
      var newDocRepRef = db.collection('notification').doc(newDocRep.id);
      var newDocAdminpRef = db.collection('notification').doc(newDocAdmin.id);
      batch.set(newDocRepRef, dataRep);
      batch.set(newDocAdminpRef, dataAdmin);
      batch.commit();

      return response.send({
        statusCode: 200,
      });
    })    
  } catch (err) {    
    return response.send({
      statusCode: 404,
      error: err,
    });
  }
});

exports.acceptAssignedSupport = functions.https.onRequest( async (request, response) => {
  const requestId = request.body.requestid;
  const notificationId = request.body.notificationid;

  try {
    await db
    .collection("notification")
    .doc(notificationId)
    .update({'type': 'assignAccepted'})
    .then(() => {
      console.log("Upated notification type successfully!")
    }); 

    await db
    .collection("request")
    .doc(requestId)
    .update({'status': 'accepted'})
    .then(() => {
      console.log("Accepted an Assgiend Support successfully!")
      return response.send({
        statusCode: 200,
      });
    });
  } catch (err) {    
    return response.send({
      statusCode: 404,
      error: err,
    });
  }
});

exports.declineAssignedSupport = functions.https.onRequest( async (request, response) => {
  const requestId = request.body.requestid;
  const notificationId = request.body.notificationid;
  const reason = request.body.reason;  
  const receiverId = request.body.receiverid;
  const adminId = request.body.adminid;  
  
  try {
    const receiverDoc = await db
    .collection("users")
    .doc(receiverId)    
    .get();
    const receiverName = receiverDoc.data().firstname + " " + receiverDoc.data().lastname;

    await db
    .collection("notification")
    .doc(notificationId)
    .update({'type': "assignDeclined"})
    .then(() => {
      console.log("Upated notification type successfully!")
    });

    await db
    .collection("request")
    .doc(requestId)
    .update({'status': 'pending', 'receiverId': '', 'receiver': ''})
    .then(() => {
      console.log("Declined an assigned Support successfully!")

      const messageAdmin = receiverName + ' declined an assigned support with "' + reason + '"'; 
      const dataAdmin = {          
        title: 'Decline Assigned Request',
        type: 'assignDeclined',
        message: messageAdmin,
        time: new Date().getTime(),
        sender: receiverId,
        receivers: [adminId],
        request: requestId,
      };

      const batch = db.batch();
      var newDocAdmin = db.collection('notification').doc();
      var newDocAdminpRef = db.collection('notification').doc(newDocAdmin.id);
      batch.set(newDocAdminpRef, dataAdmin);
      batch.commit();

      return response.send({
        statusCode: 200,
      });
    })    
  } catch (err) {    
    return response.send({
      statusCode: 404,
      error: err,
    });
  }  
});

exports.colleagueRequest = functions.https.onRequest( async (request, response) => {
  const requestId = request.body.requestid; 
  const receiverId = request.body.receiverid;
  const secReceiverId = request.body.secondReceiverid;
  
  try {
    const secReceiverDoc = await db
    .collection("users")
    .doc(secReceiverId)    
    .get();
    const secReceiverName = secReceiverDoc.data().firstname + " " + secReceiverDoc.data().lastname;

    const requestDoc = await db
    .collection("request")
    .doc(requestId)    
    .get();

    var receiverName = ""     
    var otherReceiverIds = []
    var otherReceivers = []
    if (!requestDoc.empty){
      if (requestDoc.data().otherReceiverIds) {
        otherReceiverIds = requestDoc.data().otherReceiverIds
      }
      if (requestDoc.data().otherReceivers) {
        otherReceivers = requestDoc.data().otherReceivers
      }
      receiverName = requestDoc.data().receiver.firstname + " " + requestDoc.data().receiver.lastname; 
    }

    if (!otherReceiverIds.includes(secReceiverId)){
      otherReceiverIds.push(secReceiverId)
      otherReceivers.push(secReceiverDoc.data())
    }    

    await db
    .collection("request")
    .doc(requestId)
    .update({'status': 'requestedColleague', 'otherReceiverIds': otherReceiverIds, 'otherReceivers': otherReceivers})
    .then(() => {
      console.log("Requested colleague successfully!")

      const messageRep = "You has requested " + secReceiverName + " to join a chat support.";         
      const dataRep = {          
        title: 'Requested Join',
        type: 'requestedColleague',
        message: messageRep,
        time: new Date().getTime(),
        sender: receiverId,
        receivers: [receiverId],
        request: requestId,
      };

      const messageSecond = receiverName + " has requested you to join a chat support.";          
      const dataSecond = {          
        title: 'Request Join',
        type: 'colleague',
        message: messageSecond,
        time: new Date().getTime(),
        sender: receiverId,
        receivers: [secReceiverId],
        request: requestId,
      };

      const batch = db.batch();
      var newDocRep = db.collection('notification').doc();
      var newDocSecond = db.collection('notification').doc();     
      var newDocRepRef = db.collection('notification').doc(newDocRep.id);
      var newDocSecondRef = db.collection('notification').doc(newDocSecond.id);
      batch.set(newDocRepRef, dataRep);
      batch.set(newDocSecondRef, dataSecond);
      batch.commit();

      return response.send({
        statusCode: 200,
      });
    });    
  } catch (err) {    
    return response.send({
      statusCode: 404,
      error: err,
    });
  }
});

exports.acceptColleagueRequest = functions.https.onRequest( async (request, response) => {
  const requestId = request.body.requestid;
  const notificationId = request.body.notificationid;
  const type = request.body.type;
  const updatedType = (type === 'colleague') ? 'colleagueAccepted' : 'acceptedAssignColleague'

  try {
    await db
    .collection("notification")
    .doc(notificationId)
    .update({'type': updatedType })
    .then(() => {
      console.log("Updated notification type successfully!")
    });
    
    await db
    .collection("request")
    .doc(requestId)
    .update({'status': 'addedColleague'})
    .then(() => {
      return response.send({
        statusCode: 200,
      });
    })    
  } catch (err) {    
    return response.send({
      statusCode: 404,
      error: err,
    });
  }
});

exports.declineColleagueRequest = functions.https.onRequest( async (request, response) => {
  const requestId = request.body.requestid;
  const notificationId = request.body.notificationid;
  const receiverId = request.body.receiverid;
  const secReceiverId = request.body.secondReceiverid;

  try {
    const secReceiverDoc = await db
    .collection("users")
    .doc(secReceiverId)    
    .get();
    const secReceiverName = secReceiverDoc.data().firstname + " " + secReceiverDoc.data().lastname;

    const requestDoc = await db
    .collection("request")
    .doc(requestId)    
    .get();
    
    var senderName = ""
    var otherReceiverIds = []
    var otherReceivers = []
    if (!requestDoc.empty){
      if (requestDoc.data().otherReceiverIds) {
        otherReceiverIds = requestDoc.data().otherReceiverIds
      }

      if (requestDoc.data().otherReceivers) {
        otherReceivers = requestDoc.data().otherReceivers
      }

      senderName =  requestDoc.data().sender.firstname + " " + requestDoc.data().sender.lastname;
    }

    if (otherReceiverIds.includes(secReceiverId)) {
      const index = otherReceiverIds.indexOf(secReceiverId)
      otherReceiverIds.splice(index, 1);
      otherReceivers.splice(index, 1);
    }
    
    await db
    .collection("notification")
    .doc(notificationId)
    .update({'type': "colleagueDeclined"})
    .then(() => {
      console.log("Declined Colleague Request successfully!")
    });

    await db
    .collection("request")
    .doc(requestId)
    .update({'status': 'declinedColleague', 'otherReceiverIds': otherReceiverIds, 'otherReceivers': otherReceivers})
    .then(() => {
      console.log("Requested colleague successfully!")

      const messageRep = secReceiverName + ' declined a your colleague request for ' + senderName + "'s chat support."; 
      const dataRep = {          
        title: 'Declined Colleague Request',
        type: 'colleagueDeclined',
        message: messageRep,
        time: new Date().getTime(),
        sender: secReceiverId,
        receivers: [receiverId],
        request: requestId,
      };

      const batch = db.batch();
      var newDocRep = db.collection('notification').doc();
      var newDocRepRef = db.collection('notification').doc(newDocRep.id);
      batch.set(newDocRepRef, dataRep);
      batch.commit();

      return response.send({
        statusCode: 200,
      });
    });
  } catch (err) {    
    return response.send({
      statusCode: 404,
      error: err,
    });
  }
});

exports.askingAdmin = functions.https.onRequest( async (request, response) => {
  const requestId = request.body.requestid;
  const receiverId = request.body.receiverid;
  const messageToAdmin = request.body.messagetoadmin;
  
  try {
    const receiverDoc = await db
    .collection("users")
    .doc(receiverId)    
    .get();
    const receiverName = receiverDoc.data().firstname + " " + receiverDoc.data().lastname;

    const adminSnapshot = await db
    .collection('users')
    .where('type', '==', 'admin')
    .get();
    const adminId = adminSnapshot.docs[0].id;

    const messageRep = "You has asked Admin to assign someone on a chat support.";         
    const dataRep = {          
      title: 'Asked Admin to Assign',
      type: 'askedAdmin',
      message: messageRep,
      time: new Date().getTime(),
      sender: receiverId,
      receivers: [receiverId],
      request: requestId,
      messageToAdmin: messageToAdmin
    };
      
    const messageAdmin = receiverName + " has asked you to assign someone on a chat support.";          
    const dataAdmin = {          
      title: 'Asked for Assign',
      type: 'askingAdmin',
      message: messageAdmin,
      time: new Date().getTime(),
      sender: receiverId,
      receivers: [adminId],
      request: requestId,
      messageToAdmin: messageToAdmin,
    };
   
    const batch = db.batch();
    var newDocRep = db.collection('notification').doc();
    var newDocAdmin = db.collection('notification').doc();    
    var newDocRepRef = db.collection('notification').doc(newDocRep.id);
    var newDocAdminpRef = db.collection('notification').doc(newDocAdmin.id);    
    batch.set(newDocRepRef, dataRep);   
    batch.set(newDocAdminpRef, dataAdmin);     
    batch.commit();

    return response.send({
      statusCode: 200,
    });
  
  } catch (err) {    
    return response.send({
      statusCode: 404,
      error: err,
    });
  }
});

exports.declineAssignAsking = functions.https.onRequest( async (request, response) => {
  const notificationId = request.body.notificationid;
  const receiverId = request.body.repid;
  const adminId = request.body.userid;  
  
  try {
    await db
    .collection("notification")
    .doc(notificationId)
    .update({'type': "declinedAsking"})
    .then(() => {
      console.log("Upated notification type successfully!")

      const messageRep = 'Admin has declined your asking to assign someone on a chat support.'; 
      const dataRep = {          
        title: 'Decline Assigned Colleague Request',
        type: 'declinedAsking',
        message: messageRep,
        time: new Date().getTime(),
        sender: adminId,
        receivers: [receiverId],
      };

      const batch = db.batch();
      var newDocRep = db.collection('notification').doc();
      var newDocRepRef = db.collection('notification').doc(newDocRep.id);
      batch.set(newDocRepRef, dataRep);
      batch.commit();

      return response.send({
        statusCode: 200,
      }); 
    });

  } catch (err) {    
    return response.send({
      statusCode: 404,
      error: err,
    });
  }
});

exports.assignColleagueSupport = functions.https.onRequest( async (request, response) => {
  const requestId = request.body.requestid;
  const secReceiverId = request.body.receiverid;
  const adminId = request.body.adminid;
  const notificationId = request.body.notificationid;
  
  try {  
    await db
    .collection("notification")
    .doc(notificationId)
    .update({'type': "askedAdmin"})
    .then(() => {
      console.log("Updated type successfully!")
    });

    const secReceiverDoc = await db
    .collection("users")
    .doc(secReceiverId)    
    .get();
    const secReceiverName = secReceiverDoc.data().firstname + " " + secReceiverDoc.data().lastname;

    const requestDoc = await db
    .collection("request")
    .doc(requestId)    
    .get();

    var senderName = ""     
    var otherReceiverIds = []
    var otherReceivers = []

    if (!requestDoc.empty){
      if (requestDoc.data().otherReceiverIds) {
        otherReceiverIds = requestDoc.data().otherReceiverIds
      }
      if (requestDoc.data().otherReceivers) {
        otherReceivers = requestDoc.data().otherReceivers
      }
      senderName = requestDoc.data().sender.firstname + " " + requestDoc.data().sender.lastname; 
    }

    if (!otherReceiverIds.includes(secReceiverId)){
      otherReceiverIds.push(secReceiverId)
      otherReceivers.push(secReceiverDoc.data())
    }    

    await db
    .collection("request")
    .doc(requestId)
    .update({'status': 'assignColleague', 'otherReceiverIds': otherReceiverIds, 'otherReceivers': otherReceivers})
    .then(() => {
      console.log("Requested colleague successfully!")

      const messageSecond = "A support request from " + senderName + " is assigned to you as a colleague.";        
      const dataSecondRep = {          
        title: 'Colleague Assigned',
        type: 'assignColleague',
        message: messageSecond,
        time: new Date().getTime(),
        sender: adminId,
        receivers: [secReceiverId],
        request: requestId,
      };

      const messageAdmin = "You has assigned " + secReceiverName + " on a " + senderName + "'s chat support as colleague.";         
      const dataAdmin = {          
        title: 'Colleague Assigned',
        type: 'assignColleague',
        message: messageAdmin,
        time: new Date().getTime(),
        sender: adminId,
        receivers: [adminId],
        request: requestId,
      };

      const batch = db.batch();
      var newDocSecondRep = db.collection('notification').doc();
      var newDocAdmin = db.collection('notification').doc();
      var newDocSecondRepRef = db.collection('notification').doc(newDocSecondRep.id);
      var newDocAdminpRef = db.collection('notification').doc(newDocAdmin.id);
      batch.set(newDocSecondRepRef, dataSecondRep);
      batch.set(newDocAdminpRef, dataAdmin);
      batch.commit();

      return response.send({
        statusCode: 200,
      });
    });   
  } catch (err) {    
    return response.send({
      statusCode: 404,
      error: err,
    });
  }
});

exports.declineAssignedColleague = functions.https.onRequest( async (request, response) => {
  const requestId = request.body.requestid;
  const notificationId = request.body.notificationid;
  const reason = request.body.reason;  
  const secReceiverId = request.body.receiverid;
  const adminId = request.body.adminid;  
  
  try {
    const secReceiverDoc = await db
    .collection("users")
    .doc(secReceiverId)    
    .get();
    const secReceiverName = secReceiverDoc.data().firstname + " " + secReceiverDoc.data().lastname;

    await db
    .collection("notification")
    .doc(notificationId)
    .update({'type': "declinedAssignColleague"})
    .then(() => {
      console.log("Upated notification type successfully!")
    });

    const requestDoc = await db
    .collection("request")
    .doc(requestId)    
    .get();
    
    var senderName = ""
    var otherReceiverIds = []
    var otherReceivers = []

    if (!requestDoc.empty){
      if (requestDoc.data().otherReceiverIds) {
        otherReceiverIds = requestDoc.data().otherReceiverIds
      }
      if (requestDoc.data().otherReceivers) {
        otherReceivers = requestDoc.data().otherReceivers
      }
      senderName =  requestDoc.data().sender.firstname + " " + requestDoc.data().sender.lastname;
    }

    if (otherReceiverIds.includes(secReceiverId)) {
      const index = otherReceiverIds.indexOf(secReceiverId)
      otherReceiverIds.splice(index, 1);
      otherReceivers.splice(index, 1);
    }

    await db
    .collection("request")
    .doc(requestId)
    .update({'status': 'declinedAssignColleague', 'otherReceiverIds': otherReceiverIds, 'otherReceivers': otherReceivers})
    .then(() => {

      const messageAdmin = secReceiverName + ' declined an assigned request as a colleague with "' + reason + '"'; 
      const dataAdmin = {          
        title: 'Decline Assigned Colleague Request',
        type: 'assignColleagueDeclined',
        message: messageAdmin,
        time: new Date().getTime(),
        sender: secReceiverId,
        receivers: [adminId],
        request: requestId,
      };

      const batch = db.batch();
      var newDocAdmin = db.collection('notification').doc();
      var newDocAdminpRef = db.collection('notification').doc(newDocAdmin.id);
      batch.set(newDocAdminpRef, dataAdmin);
      batch.commit();

      return response.send({
        statusCode: 200,
      });  
    });      
  } catch (err) {    
    return response.send({
      statusCode: 404,
      error: err,
    });
  }
});

exports.addSurveyAnswer = functions.https.onRequest( async (request, response) => {
  const surveyId = request.body.surveyid;
  const receiverId = request.body.userid;
  const notificationId = request.body.notificationid;
  const answers = request.body.answers;  
  
  try {
    const batch = db.batch();

    const notificationSnapshot = await db
    .collection('notification')
    .doc(notificationId)
    .get();

    var receivers = notificationSnapshot.data().receivers
    if (receivers.includes(receiverId)) {
      const index = receivers.indexOf(receiverId)
      receivers.splice(index, 1);
    }
    batch.update(notificationSnapshot.ref, {"receivers": receivers}) 


    const surveySnapshot = await db
    .collection('survey')
    .doc(surveyId)
    .get();

    const submissions = surveySnapshot.data().submissions + 1;
    batch.update(surveySnapshot.ref, {"submissions": submissions})

    const answerDoc = {
      userID: receiverId,
      answers: answers,           
      date: new Date().getTime()
    }

    batch.set(db.collection('survey').doc(surveyId).collection("answers").doc(receiverId), answerDoc)

    batch.commit();

    return response.send({
      statusCode: 200,
    });
  } catch (err) {
    return response.send({
      statusCode: 404,
      error: err,
    });
  }
});

exports.getRepProfile = functions.https.onRequest( async (request, response) => {
  const receiverId = request.body.userid;

  var promises = [];
  var notifications = [];
  var targets = [];
  var rating = [];

  var requests = [];
  var scRequests = [];
  var activeSessions = [];

  var unavailables = [];

  try {
    const receiverDoc = await db
    .collection("users")
    .doc(receiverId)    
    .get();
    
    await db
    .collection("rating")
    .doc(receiverId)
    .get()
    .then(ratingSnapshot => {
      if (ratingSnapshot.exists) {        
        rating = ratingSnapshot.data().rating
      }
    })

    await db
    .collection("unavailablility")
    .doc(receiverId)
    .get()
    .then(unavailableSnapshot => {
      if (unavailableSnapshot.exists) {        
        unavailables = unavailableSnapshot.data().unavailabilities
      }
    })

    const snapshot = await db
    .collection('notification')
    .where('receivers', 'array-contains', receiverId)
    .orderBy('time', 'desc')
    .limit(100)
    .get();

    if (!snapshot.empty) {
      snapshot.forEach(notification => {
        notifications.push({...notification.data(), notificationId: notification.id });
        promises.push(db.collection("users").doc(notification.data().sender).get())
      });
  
      var users = await Promise.all(promises);

      notifications.forEach(notification => {
        var tmpusers = users.filter(item => item.data().userid === notification.sender);
  
        if (tmpusers.length > 0){
          targets.push({notification: notification, sender: tmpusers[0].data(), request: null});   
        }      
      });
    }

    const requestSnapshot = await db
    .collection('request')
    .where('receiverId', '==', receiverId)
    .orderBy('scheduleTime', 'desc')
    .get();

    if (!requestSnapshot.empty) {
      requestSnapshot.forEach(request => {
        if ( request.data().status != 'cancelled' )  {
          requests.push({...request.data()});
        }
      });

      let today = new Date()

      requests.forEach(request => {   
        if ((request.status == 'scheduled') && (request.isSchedule == true) && (request.scheduleTime > today.getTime())) { 
          scRequests.push(request);
        } else if (request.status == 'completed') { 
        } else { 
          activeSessions.push(request);
        }
      });
    }

    return response.send({
      statusCode: 200,
      rep: receiverDoc.data(),
      notifications: targets,
      scheduled: scRequests,
      active: activeSessions,
      ratings: rating,
      unavailable: unavailables
    });
  } catch (err) {
    return response.send({
      statusCode: 404,
      error: err,
    });
  }
});

exports.removeRep = functions.https.onRequest( async (request, response) => {
  const repId = request.body.userid;
 
  try {
    await db
    .collection('users')
    .doc(repId)
    .update({'isAccept': 'deleted'})
    .then(() => {
      console.log("Updated user's isAccept!")
    });    

    admin.auth()
    .deleteUser(repId)
    .then(() => {
      console.log('Successfully deleted user');
      return response.send({
        statusCode: 200,
      });  
    });    
  } catch (err) {    
    return response.send({
      statusCode: 404,
      error: err,
    });
  }
});

exports.writeUnavailability = functions.https.onRequest( async (request, response) => {
  const receiverId = request.body.userid;
  const startTime = request.body.startTime;
  const duration = request.body.duration;
  const title = request.body.title;

  try {
    const unavailablilityDoc = await db
    .collection('unavailablility')
    .doc(receiverId)    
    .get();
    
    var receiverUnavailabilities = []
    if (unavailablilityDoc.exists){
      if (unavailablilityDoc.data().unavailabilities){
        receiverUnavailabilities = unavailablilityDoc.data().unavailabilities;        
      }

      receiverUnavailabilities.push({'startTime': startTime, 'title': title, 'duration': duration, 'time': new Date().getTime()})     
      await db
      .collection("unavailablility")
      .doc(receiverId)
      .update({'unavailabilities': receiverUnavailabilities})
      .then(() => {
        console.log("Unavailability was posted successfully!")
        return response.send({
          statusCode: 200,
        });
      });      
    } else {
      receiverUnavailabilities.push({'startTime': startTime, 'title': title, 'duration': duration, 'time': new Date().getTime()})

      await db
      .collection("unavailablility")
      .doc(receiverId)
      .set({'unavailabilities': receiverUnavailabilities})
      .then(() => {
        console.log("Unavailability was posted successfully!")

        return response.send({
          statusCode: 200,
        });
      });      
    }
  } catch (err) {
    return response.send({
      statusCode: 404,
      error: err,
    });
  }
});
