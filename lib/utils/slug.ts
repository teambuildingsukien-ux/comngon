/**
 * Slug utilities for organization slugs
 * Generates URL-friendly slugs and validates them
 */

/**
 * Generate a URL-friendly slug from organization name
 * @param name - Organization name
 * @returns slug - URL-friendly slug
 */
export function generateSlug(name: string): string {
    return name
        .toLowerCase()
        .trim()
        // Replace Vietnamese characters
        .normalize('NFD')
        .replace(/[\u0300-\u036f]/g, '')
        // Replace spaces and special chars with hyphens
        .replace(/[^a-z0-9]+/g, '-')
        // Remove leading/trailing hyphens
        .replace(/^-+|-+$/g, '')
        // Limit length
        .substring(0, 50);
}

/**
 * Validate slug format
 * @param slug - Slug to validate
 * @returns boolean - true if valid
 */
export function validateSlug(slug: string): boolean {
    // Must be 3-50 chars, only lowercase letters, numbers, and hyphens
    // Cannot start or end with hyphen
    const slugRegex = /^[a-z0-9]([a-z0-9-]{1,48}[a-z0-9])?$/;
    return slugRegex.test(slug);
}

/**
 * Check if slug is reserved
 * @param slug - Slug to check
 * @returns boolean - true if reserved
 */
export function isReservedSlug(slug: string): boolean {
    const reserved = [
        'admin',
        'api',
        'signup',
        'login',
        'dashboard',
        'settings',
        'help',
        'support',
        'app',
        'www',
        'blog',
        'docs',
        'status',
    ];
    return reserved.includes(slug);
}
