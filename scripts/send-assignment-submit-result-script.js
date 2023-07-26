import pkg from "pg";
const { Pool } = pkg;
import fetch from "node-fetch";

const headers = {
  Accept: "application/vnd.github+json",
  Authorization: process.env.AUTH_GITHUB_TOKEN,
  "X-GitHub-Api-Version": "2022-11-28",
};

const testRepoName = process.argv[2];

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: {
    rejectUnauthorized: false,
  },
});

async function sendAssignmentSubmitResult(repoName) {
  const org = repoName.split("/")[0];
  const repo = repoName.split("/")[1];
  let userAssignmentValues;

  try {
    const fetchingRepo = await fetch(
      `https://api.github.com/repos/${org}/${repo}`,
      {
        headers: headers,
      }
    );

    const repoInfo = await fetchingRepo.json();
    const assignmentName = repoInfo.template_repository.full_name.replace(
      org + "/",
      ""
    );
    const team = repoName.replace(
      repoInfo.template_repository.full_name + "-",
      ""
    );

    const fetchingTeamMember = await fetch(
      `https://api.github.com/orgs/${org}/teams/${team}/members`,
      {
        headers: headers,
      }
    );
    const teamMember = await fetchingTeamMember.json();

    for (const item of teamMember) {
      const client = await pool.connect();
      const user = await client.query(
        `
          SELECT "id" as "userId"
          FROM "UserList"
          WHERE "githubUsername" = $1;
        `,
        [item.login.toLowerCase()]
      );

      const lessonAssignmentId = await client.query(
        `
          SELECT "lessonAssignmentId"
          FROM "LessonAssignment"
          WHERE "assignmentName" = $1;
        `,
        [assignmentName]
      );

      userAssignmentValues = [
        user.rows[0].userId,
        lessonAssignmentId.rows[0].lessonAssignmentId,
        JSON.stringify({
          url: `https://github.com/${repoName}`,
          repoName,
        }),
        null,
        null,
      ];

      const updateUserAssignmentQuery = `
        INSERT INTO "UserAssignment" ("userId", "lessonAssignmentId", "userAssignmentLink", "score", "feedback", "createdAt", "updatedAt")
        VALUES ($1, $2, $3, $4, $5, NOW(), NOW())
        ON CONFLICT ("userId", "lessonAssignmentId") DO UPDATE
        SET "updatedAt" = NOW();
      `;

      await client.query(updateUserAssignmentQuery, userAssignmentValues);
      client.release();
    }
    // Data debugging log section
    const dataDebuggingLog = {
      org,
      repo,
      team,
      teamMember,
      userAssignmentValues,
    };

    console.log(`Data debugging log: ${dataDebuggingLog}`);
  } catch (error) {
    console.error("Error:", error);
    throw error;
  } finally {
    pool.end();
  }
}

sendAssignmentSubmitResult(testRepoName);
