/**
 * Variable Substitution Service
 * Handles runtime replacement of {{VARIABLE_NAME}} placeholders in HTTP request configurations
 */

/**
 * Substitutes variables in a request configuration
 * @param {Object} config - Request configuration (url, headers, body, params)
 * @param {Object} variables - Key-value map of variables to substitute
 * @returns {Object} - Config with substituted values
 * @throws {Error} - If a referenced variable is not found
 */
export const substituteVariables = (config, variables) => {
    if (!variables || Object.keys(variables).length === 0) {
        return config;
    }

    // Deep clone to avoid mutating original config
    const substituted = JSON.parse(JSON.stringify(config));

    // Recursively substitute in all fields
    substituted.url = substituteInValue(substituted.url, variables);
    substituted.headers = substituteInObject(substituted.headers, variables);
    substituted.body = substituteInValue(substituted.body, variables);
    substituted.params = substituteInObject(substituted.params, variables);

    return substituted;
};

/**
 * Substitutes variables in a single value (string, number, boolean, object, array)
 * @param {*} value - Value to process
 * @param {Object} variables - Variable map
 * @returns {*} - Processed value
 */
const substituteInValue = (value, variables) => {
    if (value === null || value === undefined) {
        return value;
    }

    // Handle strings with variable placeholders
    if (typeof value === 'string') {
        return substituteInString(value, variables);
    }

    // Handle objects recursively
    if (typeof value === 'object' && !Array.isArray(value)) {
        return substituteInObject(value, variables);
    }

    // Handle arrays recursively
    if (Array.isArray(value)) {
        return value.map(item => substituteInValue(item, variables));
    }

    // Return primitives as-is
    return value;
};

/**
 * Substitutes variables in an object
 * @param {Object} obj - Object to process
 * @param {Object} variables - Variable map
 * @returns {Object} - Processed object
 */
const substituteInObject = (obj, variables) => {
    if (!obj || typeof obj !== 'object') {
        return obj;
    }

    const result = {};
    for (const [key, value] of Object.entries(obj)) {
        // Substitute in both key and value
        const newKey = substituteInString(key, variables);
        result[newKey] = substituteInValue(value, variables);
    }
    return result;
};

/**
 * Substitutes variables in a string
 * Supports {{VARIABLE_NAME}} syntax
 * @param {string} str - String to process
 * @param {Object} variables - Variable map
 * @returns {string} - Processed string
 * @throws {Error} - If a referenced variable is not found
 */
const substituteInString = (str, variables) => {
    if (typeof str !== 'string') {
        return str;
    }

    // Match {{VARIABLE_NAME}} patterns
    const regex = /\{\{([A-Za-z0-9_]+)\}\}/g;

    return str.replace(regex, (match, varName) => {
        if (!(varName in variables)) {
            throw new Error(`Variable '${varName}' not found in environment`);
        }
        return variables[varName];
    });
};

export default {
    substituteVariables
};
