import { initializeApp } from 'firebase/app';
import { getAuth, GoogleAuthProvider, signInWithPopup, signOut, browserPopupRedirectResolver } from 'firebase/auth';
import { getAnalytics, isSupported, logEvent } from 'firebase/analytics';
import firebaseConfig from '../firebase-applet-config.json';

const app = initializeApp(firebaseConfig);
export const auth = getAuth(app);
export const googleProvider = new GoogleAuthProvider();

// Initialize Analytics conditionally (only runs in browser, requires measurementId)
export const analytics = isSupported().then(supported => {
  if (supported && firebaseConfig.measurementId) {
    return getAnalytics(app);
  }
  return null;
});

// Helper for logging custom events anywhere in the app
export const trackEvent = async (eventName: string, eventParams?: Record<string, any>) => {
  const analyticsInstance = await analytics;
  if (analyticsInstance) {
    logEvent(analyticsInstance, eventName, eventParams);
  }
};


export const signInWithGoogle = async () => {
  try {
    const result = await signInWithPopup(auth, googleProvider, browserPopupRedirectResolver);
    return result.user;
  } catch (error: any) {
    if (error.code === 'auth/unauthorized-domain') {
       console.error(`Popup failed with unauthorized-domain. Please ensure your domain (${window.location.hostname}) is whitelisted.`);
    }
    console.error("Error signing in with Google", error);
    throw new Error(`Sign-in failed: ${error.message}. Please ensure ${window.location.hostname} is added to Authorized Domains in Firebase Auth settings.`);
  }
};

export const logout = async () => {
  try {
    await signOut(auth);
  } catch (error) {
    console.error("Error signing out", error);
    throw error;
  }
};
