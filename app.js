const { cloud } = require('./utils/cloud');

App({
    globalData: {
        session: null,
        member: null,
    },

    onLaunch() {
        this.sessionPromise = cloud.auth.getSession();
    },

    ensureSession() {
        if (!this.sessionPromise) {
            this.sessionPromise = cloud.auth.getSession();
        }
        return this.sessionPromise;
    },

    setSession(session) {
        this.globalData.session = session;
        this.sessionPromise = Promise.resolve({ data: session, error: null });
    },

    resetSession() {
        this.sessionPromise = null;
        this.globalData.session = null;
        this.globalData.member = null;
    },
});
