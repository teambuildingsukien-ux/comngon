'use client';

import { useState, useEffect, useCallback } from 'react';
import type { FeatureStatus } from '@/components/FeatureStatusBadge';

interface TenantFeatures {
    ai_chat: boolean;
    ai_reports: boolean;
    ai_settings: boolean;
    knowledge_base: boolean;
    bulk_registration: boolean;
    export_excel: boolean;
    custom_branding: boolean;
    api_access: boolean;
    advanced_analytics: boolean;
    multi_shift: boolean;
    notifications: boolean;
    max_departments: number;
    max_shifts: number;
    max_groups: number;
    [key: string]: any;
}

interface FeatureRegistryItem {
    key: string;
    label: string;
    description?: string;
    icon?: string;
    status: FeatureStatus;
    status_note?: string;
    changelog?: string;
    released_at?: string;
}

interface UseTenantFeaturesReturn {
    features: TenantFeatures | null;
    plan: string | null;
    loading: boolean;
    registry: FeatureRegistryItem[];
    isEnabled: (key: string) => boolean;
    getFeatureStatus: (key: string) => FeatureStatus;
    getRegistryItem: (key: string) => FeatureRegistryItem | undefined;
}

// Default free plan features (fallback)
const DEFAULT_FEATURES: TenantFeatures = {
    ai_chat: false,
    ai_reports: false,
    ai_settings: false,
    knowledge_base: false,
    bulk_registration: true,
    export_excel: false,
    custom_branding: false,
    api_access: false,
    advanced_analytics: false,
    multi_shift: false,
    notifications: true,
    max_departments: 2,
    max_shifts: 1,
    max_groups: 2,
};

// Cache to avoid redundant API calls across components
let cachedFeatures: TenantFeatures | null = null;
let cachedPlan: string | null = null;
let cachedRegistry: FeatureRegistryItem[] = [];
let cacheTimestamp = 0;
const CACHE_TTL = 5 * 60 * 1000; // 5 minutes cache

/**
 * Hook to get tenant feature flags for client-side feature gating.
 * Uses in-memory cache (5 min TTL) to avoid redundant API calls.
 * 
 * Usage:
 *   const { isEnabled, loading } = useTenantFeatures();
 *   if (!isEnabled('export_excel')) return <UpgradePrompt />;
 */
export function useTenantFeatures(): UseTenantFeaturesReturn {
    const [features, setFeatures] = useState<TenantFeatures | null>(cachedFeatures);
    const [plan, setPlan] = useState<string | null>(cachedPlan);
    const [registry, setRegistry] = useState<FeatureRegistryItem[]>(cachedRegistry);
    const [loading, setLoading] = useState(!cachedFeatures);

    useEffect(() => {
        // Use cache if valid
        if (cachedFeatures && Date.now() - cacheTimestamp < CACHE_TTL) {
            setFeatures(cachedFeatures);
            setPlan(cachedPlan);
            setRegistry(cachedRegistry);
            setLoading(false);
            return;
        }

        const fetchFeatures = async () => {
            try {
                const res = await fetch('/api/tenant/features');
                if (res.ok) {
                    const data = await res.json();
                    cachedFeatures = data.features;
                    cachedPlan = data.plan;
                    cachedRegistry = data.registry || [];
                    cacheTimestamp = Date.now();
                    setFeatures(data.features);
                    setPlan(data.plan);
                    setRegistry(data.registry || []);
                } else {
                    // Fallback to defaults on error
                    setFeatures(DEFAULT_FEATURES);
                    setPlan('free');
                }
            } catch {
                setFeatures(DEFAULT_FEATURES);
                setPlan('free');
            } finally {
                setLoading(false);
            }
        };

        fetchFeatures();
    }, []);

    const isEnabled = useCallback((key: string): boolean => {
        if (!features) return DEFAULT_FEATURES[key] ?? false;
        return !!features[key];
    }, [features]);

    const getFeatureStatus = useCallback((key: string): FeatureStatus => {
        const item = registry.find(r => r.key === key);
        return item?.status || 'stable';
    }, [registry]);

    const getRegistryItem = useCallback((key: string): FeatureRegistryItem | undefined => {
        return registry.find(r => r.key === key);
    }, [registry]);

    return { features, plan, loading, registry, isEnabled, getFeatureStatus, getRegistryItem };
}
