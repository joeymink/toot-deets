import axios from 'axios';

// Assume last command line parameter is the toot URL:
const tootUrlStr = process.argv[process.argv.length -1];

// Sample URL:
// https://vmst.io/@onmywalk/113858174270307583
const tootUrl = new URL(tootUrlStr);

// Find something like '/113464748329` in the toot URL:
const tootId = tootUrl.pathname.match(/\/([0-9]+)/)[1];

/**
 * Lifted from https://stackoverflow.com/questions/951021/what-is-the-javascript-version-of-sleep
 * @param {*} ms millisecons to wait
 */
function sleep(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
}

/**
 * Returns the Mastodon API path to fetch a toot's boosts.
 * @param {*} statusId The status id of the toot.
 */
const rebloggedByPath = (statusId) => (
    `api/v1/statuses/${statusId}/reblogged_by?limit=80`
);

/**
 * Returns the Mastodon API path to fetch a toot's favorites.
 * @param {*} statusId The status id of the toot.
 */
const favoritedByPath = (statusId) => (
    `api/v1/statuses/${statusId}/favourited_by?limit=80`
);

/**
 * Inspects the headers to determine if the given AxiosResponse
 * (assumed to be from a Mastondon API call) has a next page
 * of results. Read more about Mastodon API pagination here:
 * 
 * https://docs.joinmastodon.org/api/guidelines/#pagination
 * 
 * @param {*} axiosResp an AxiosResponse instance
 * @returns the url to obtain the next page of results
 */
const parseNextPage = (axiosResp) => {
    const linkHeader = axiosResp.headers.link;
    if (!linkHeader) {
        return null;
    }

    // The header we are after has a value like this:
    // <https://foo.bar/path/?max_id=113881887831227918>; rel="next", <https://foo.bar/path?since_id=113984443755764835>; rel="prev"

    const nextLink = linkHeader.split(',').find((data) => data.includes('rel="next"'));
    if (!nextLink) {
        return null;
    }

    return nextLink.match(/\<(.*)\>/)[1];
};

/**
 * Takes a reblogged_by or favorited_by API url and
 * aggregates all pages of accounts returned.
 * 
 * @param {*} apiUrl the API url to aggregate data from
 * @returns 
 */
const gatherAllReactions = async (apiUrl) => {
    let accounts = [];
    let nextPage = null;

    do {
        const urlToFetch = nextPage || apiUrl;
        const response = await axios.get(urlToFetch);
        accounts = [...accounts, ...response.data];
        // Want to go easy on the Masto instance:
        await sleep(500);
        nextPage = parseNextPage(response);
    } while(nextPage !== null);

    return accounts;
};

/**
 * Generates a summary about the accounts represented
 * in the parameter.
 * 
 * @param {*} accountObjects 
 * @returns 
 */
const summarizeAccounts  = (accountObjects) => {
    const summary = {
        instances: {},
        accounts: [],
    };

    accountObjects.forEach((boost) => {
        summary.accounts.push(boost.acct);
        // Grab the account's instance domain:
        const accountSplit = boost.acct.split('@');
        let instance = accountSplit[1];
        if (!instance) {
            // Must be an account that's local to the toot:
            instance = tootUrl.hostname;
        }

        if (!summary.instances[instance]) {
            summary.instances[instance] = 1;
        } else {
            summary.instances[instance] += 1;
        }
    });

    return summary;
}

//---------------------------------------
// Main script flow and output:
//---------------------------------------

const allBoosts = await gatherAllReactions(
    `${tootUrl.origin}/${rebloggedByPath(tootId)}`
);
const boostsSummary = summarizeAccounts(allBoosts);

const allFavs = await gatherAllReactions(
    `${tootUrl.origin}/${favoritedByPath(tootId)}`
);
const favsSummary = summarizeAccounts(allFavs);

console.log(`Found ${allBoosts.length} boosts!`);
console.log(`Number of instances that boosted: ${Object.keys(boostsSummary.instances).length}`);


console.log(`Found ${allFavs.length} favs!`);
console.log(`Number of instances that favorited: ${Object.keys(favsSummary.instances).length}`);

const uniqueAccounts = 
    // All accounts that interacted:
    [...boostsSummary.accounts, ...favsSummary.accounts].reduce(
        (reduction, accountStr) => ({ ...reduction, ...{[accountStr]: true}}),
        {}
    );
console.log(`Total unique users that interacted: ${Object.keys(uniqueAccounts).length}`);

const uniqueInstances =
    // All instances represented:
    [...Object.keys(boostsSummary.instances),
        ...Object.keys(favsSummary.instances)].reduce(
            (reduction, instance) => ({...reduction, ...{[instance]: true}}),
            {}
        );
console.log(`Total unique instances that interacted: ${Object.keys(uniqueInstances).length}`);

