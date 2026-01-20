import axios from 'axios';

/**
 * Fetches all paginated results from a paginated API endpoint
 * @param {string} baseUrl - The base API URL
 * @param {Object} authConfig - Axios config with auth headers
 * @param {Object} params - Query parameters to append
 * @returns {Promise<Array>} - Array of all results across all pages
 */
export const fetchAllPages = async (baseUrl, authConfig, params = {}) => {
    const allResults = [];
    let nextUrl = baseUrl;
    const queryParams = new URLSearchParams(params);
    
    // Add page_size=100 to get maximum results per page
    queryParams.append('page_size', '100');
    
    if (queryParams.toString()) {
        nextUrl += `?${queryParams.toString()}`;
    }

    while (nextUrl) {
        try {
            const response = await axios.get(nextUrl, authConfig);
            const data = response.data;
            
            // Handle both paginated (with results) and non-paginated (array) responses
            if (Array.isArray(data)) {
                allResults.push(...data);
                nextUrl = null; // No pagination, we're done
            } else if (data.results) {
                allResults.push(...data.results);
                nextUrl = data.next; // Get next page URL
            } else {
                // Single object or unexpected format
                allResults.push(data);
                nextUrl = null;
            }
        } catch (error) {
            console.error('Error fetching paginated data:', error);
            throw error;
        }
    }

    return allResults;
};

/**
 * Fetches all results from an API endpoint (handles both paginated and non-paginated)
 * @param {string} url - The API URL
 * @param {Object} authConfig - Axios config with auth headers
 * @returns {Promise<Array>} - Array of all results
 */
export const fetchAllResults = async (url, authConfig) => {
    try {
        const response = await axios.get(url, authConfig);
        const data = response.data;
        
        if (Array.isArray(data)) {
            return data;
        } else if (data.results) {
            // Paginated response - fetch all pages
            return await fetchAllPages(url, authConfig);
        } else {
            // Single object
            return [data];
        }
    } catch (error) {
        console.error('Error fetching results:', error);
        throw error;
    }
};

