# Address PR Comments

Fetch and systematically address GitHub pull request review comments.

## Instructions

1. **Identify the PR and repo**: If no PR number is provided below, detect it from the current branch:
   ```bash
   # Get PR number
   gh pr view --json number --jq '.number'
   
   # Get owner and repo name (required for GraphQL query)
   gh repo view --json owner,name --jq '"\(.owner.login) \(.name)"'
   ```

2. Fetch unresolved review comments using the GitHub CLI with GraphQL (replace `{owner}` and `{repo}` with values from step 1):
   ```
    gh api graphql -f query='
    query($owner: String!, $repo: String!, $pr: Int!) {
    repository(owner: $owner, name: $repo) {
        pullRequest(number: $pr) {
        reviewThreads(first: 100) {
            nodes {
            isResolved
            comments(first: 10) {
                nodes {
                author { login }
                path
                line
                body
                }
            }
            }
        }
        }
    }
    }
    ' -f owner='{owner}' -f repo='{repo}' -F pr=<NUMBER> | jq '[.data.repository.pullRequest.reviewThreads.nodes[] | select(.isResolved == false)]'
    ```
Filter for unresolved threads only (where isResolved: false).
Note: This requires network access - use required_permissions: ['all']

3. **Categorize comments** into:
   - **Bot comments** (e.g., "cursor bugbot", lint bots) - usually systematic fixes
   - **Human comments** - may require discussion or clarification

4. **Present a summary** to the user like:
   ```
   Found X PR comments:

   **Bot Comments (Y):**
   1. [file.ts:L42] cursor bugbot: Missing error handling
   2. [file.ts:L87] cursor bugbot: Consider using X

   **Human Comments (Z):**
   1. [reviewer] [file.ts:L15] "Use Zod schemas instead of interfaces"
   2. [reviewer] [file.ts:L99] "This should throw instead of catching"

   Which would you like to address?
   - "all" - All comments
   - "bot" - Bot comments only
   - "human" - Human comments only
   - "1,3" - Specific comments by number
   ```

5. **Wait for user confirmation** before making any changes.

6. **Address each selected comment**:
   - Read the file at the mentioned line
   - Understand the surrounding context
   - Make the fix
   - Briefly explain the change
