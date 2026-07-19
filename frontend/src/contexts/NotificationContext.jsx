// src/contexts/NotificationContext.jsx
import React, { createContext, useContext, useState, useEffect, useCallback } from 'react';
import {
    requestNotificationPermission,
    getNotificationPermission,
    identifyUser,
    unidentifyUser,
    isPushSupported
} from '../utils/notifications';

const NotificationContext = createContext();

export const useNotification = () => {
    const context = useContext(NotificationContext);
    if (!context) {
        throw new Error('useNotification must be used within NotificationProvider');
    }
    return context;
};

export const NotificationProvider = ({ children }) => {
    const [isSubscribed, setIsSubscribed] = useState(false);
    const [isLoading, setIsLoading] = useState(true);
    const [permission, setPermission] = useState('default');
    const [userId, setUserId] = useState(null);

    // Check permission status
    const checkPermission = useCallback(async () => {
        if (!isPushSupported()) {
            setPermission('unsupported');
            setIsLoading(false);
            return false;
        }
        try {
            const status = await getNotificationPermission();
            setPermission(status);
            return status === 'granted';
        } catch (error) {
            console.error('[Notification] checkPermission error:', error);
            return false;
        }
    }, []);

    // Subscribe to push notifications
    const subscribe = useCallback(async () => {
        setIsLoading(true);
        try {
            const granted = await requestNotificationPermission();
            if (granted) {
                setPermission('granted');
                setIsSubscribed(true);
                if (userId) {
                    await identifyUser(userId);
                }
                return true;
            }
            setPermission('default');
            setIsSubscribed(false);
            return false;
        } catch (error) {
            console.error('[Notification] subscribe error:', error);
            return false;
        } finally {
            setIsLoading(false);
        }
    }, [userId]);

    // Unsubscribe from push
    const unsubscribe = useCallback(async () => {
        setIsLoading(true);
        try {
            await unidentifyUser();
            setIsSubscribed(false);
            setPermission('default');
            return true;
        } catch (error) {
            console.error('[Notification] unsubscribe error:', error);
            return false;
        } finally {
            setIsLoading(false);
        }
    }, []);

    // Identify user when userId changes
    useEffect(() => {
        if (userId && permission === 'granted') {
            identifyUser(userId);
        }
    }, [userId, permission]);

    // Initialize - check permission on mount
    useEffect(() => {
        const init = async () => {
            const granted = await checkPermission();
            setIsSubscribed(granted);
            setIsLoading(false);
        };
        init();
    }, [checkPermission]);

    // Expose setUserId so parent can pass it
    const setUser = useCallback((id) => {
        setUserId(id);
    }, []);

    const value = {
        isSubscribed,
        isLoading,
        permission,
        userId,
        setUser,
        subscribe,
        unsubscribe,
        checkPermission,
        isPushSupported: isPushSupported(),
    };

    return (
        <NotificationContext.Provider value={value}>
            {children}
        </NotificationContext.Provider>
    );
};