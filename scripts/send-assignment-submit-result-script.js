import pkg from "pg";
const { Pool } = pkg;
import fetch from "node-fetch";

const headers = {
  Accept: "application/vnd.github+json",
  Authorization: process.env.AUTH_GITHUB_TOKEN,
  "X-GitHub-Api-Version": "2022-11-28",
};

const testRepoName = process.argv[2];

const isTesterRepo = testRepoName.includes("testqa");
console.log(`💬 Tester repo: ${isTesterRepo ? "✅" : "❌"}`);

const dbConnectionString = isTesterRepo
  ? process.env.DEV_DATABASE_URL
  : process.env.DATABASE_URL;

const pool = new Pool({
  connectionString: dbConnectionString,
  ssl: {
    rejectUnauthorized: false,
  },
});

async function sendAssignmentSubmitResult(repoName) {
  const org = repoName.split("/")[0];
  const repo = repoName.split("/")[1];
  let userAssignmentValues;

  try {
    console.log(`🟢 Start fetching repo ${repoName}`);
    const fetchingRepo = await fetch(
      `https://api.github.com/repos/${org}/${repo}`,
      {
        headers: headers,
      }
    );

    const repoInfo = await fetchingRepo.json();
    console.log("🪵 Repo Info: ", JSON.stringify(repoInfo));
    const assignmentName = repoInfo.template_repository.full_name.replace(
      org + "/",
      ""
    );
    const team = repoName.replace(
      repoInfo.template_repository.full_name + "-",
      ""
    );
    console.log(`🟢 Start fetching team member on team: ${team}`);
    const fetchingTeamMember = await fetch(
      `https://api.github.com/orgs/${org}/teams/${team}/members`,
      {
        headers: headers,
      }
    );
    const teamMember = await fetchingTeamMember.json();

    console.log(`🟢 Start updating assignment status on each team member`);
    for (const item of teamMember) {
      console.log(`🙋🏽‍♂️ Team member data: ${JSON.stringify(item)}`);
      const client = await pool.connect();
      const user = await client.query(
        `
          SELECT "id" as "userId"
          FROM "UserList"
          WHERE "githubUsername" = $1;
        `,
        [item.login.toLowerCase()]
      );
      console.log(`🙋🏽‍♂️ User data: ${JSON.stringify(user)}`);
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
      console.log(
        `🟢 Updating assignment status on user: ${user.rows[0].userId}`
      );
      await client.query(updateUserAssignmentQuery, userAssignmentValues);
      client.release();
    }
  } catch (error) {
    console.error("Error:", error);
    throw error;
  } finally {
    pool.end();
  }
}

sendAssignmentSubmitResult(testRepoName);
