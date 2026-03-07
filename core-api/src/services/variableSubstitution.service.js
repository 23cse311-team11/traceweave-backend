/**
 * Variable Substitution Service
 * Handles runtime replacement of {{VARIABLE_NAME}} placeholders
 */

export const substituteVariables = (config, variables) => {
    if (!variables || Object.keys(variables).length === 0) {
        return config;
    }

    // Deep clone to avoid mutating original config
    const substituted = JSON.parse(JSON.stringify(config));

    substituted.url = substituteInValue(substituted.url, variables);
    substituted.headers = substituteInObject(substituted.headers, variables);
    substituted.body = substituteInValue(substituted.body, variables);
    substituted.params = substituteInObject(substituted.params, variables);

    return substituted;
};

const substituteInValue = (value, variables) => {
    if (value === null || value === undefined) return value;

    if (typeof value === 'string') {
        return substituteInString(value, variables);
    }
    if (typeof value === 'object' && !Array.isArray(value)) {
        return substituteInObject(value, variables);
    }
    if (Array.isArray(value)) {
        return value.map(item => substituteInValue(item, variables));
    }
    return value;
};

const substituteInObject = (obj, variables) => {
    if (!obj || typeof obj !== 'object') return obj;

    const result = {};
    for (const [key, value] of Object.entries(obj)) {
        const newKey = substituteInString(key, variables);
        result[newKey] = substituteInValue(value, variables);
    }
    return result;
};

const substituteInString = (str, variables) => {
    if (typeof str !== 'string') return str;

    // Fixed Regex: Allows alphanumeric, underscores, hyphens, and dots
    const regex = /\{\{([\w\-\.]+)\}\}/g;

    return str.replace(regex, (match, varName) => {
        if (!(varName in variables)) {
            // Optional: You can choose to leave the tag {{var}} or throw error
            // For now, throwing error ensures user knows config is broken
            throw new Error(`Variable '${varName}' not found in environment`);
        }
        return variables[varName];
    });
};

export default {
    substituteVariables
};