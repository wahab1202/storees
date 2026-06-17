// Service worker required by FCM web push. Reads the Firebase config from the
// query string the page registers it with — so you only edit config in index.html.
importScripts('https://www.gstatic.com/firebasejs/10.12.0/firebase-app-compat.js')
importScripts('https://www.gstatic.com/firebasejs/10.12.0/firebase-messaging-compat.js')

try {
  const params = new URLSearchParams(self.location.search)
  const config = JSON.parse(params.get('config') || '{}')
  if (config.apiKey) {
    firebase.initializeApp(config)
    const messaging = firebase.messaging()
    // Show notifications received while the page is in the background.
    messaging.onBackgroundMessage((payload) => {
      const n = payload.notification || {}
      self.registration.showNotification(n.title || 'Storees test', {
        body: n.body || '',
        icon: n.icon || '/favicon.ico',
        data: payload.data,
      })
    })
  }
} catch (e) {
  // Bad/missing config — getToken in the page will surface the error.
}
