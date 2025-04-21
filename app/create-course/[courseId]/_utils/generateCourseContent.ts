import { generateCourseChapters } from "@/configs/ai-models";
import { getYoutubeVideos } from "@/configs/service";
import { db } from "@/configs/db";
import { CourseChapters } from "@/schema/schema";
import { CourseType } from "@/types/types";
import OpenAI from "openai";

// Initialize OpenAI client
const openai = new OpenAI({
  apiKey: process.env.NEXT_PUBLIC_OPENAI_API_KEY || "",
  dangerouslyAllowBrowser: true,
});

export const generateCourseContent = async (
  course: CourseType,
  setLoading: (loading: boolean) => void
) => {
  setLoading(true);

  try {
    const chapters = course?.courseOutput.chapters;

    const chapterPromises = chapters?.map(async (chapter, index) => {
      const PROMPT = `Explain the concepts in detail on Topic: ${course?.courseName}, Chapter: ${chapter.chapter_name}, in JSON Format with list of array with fields as Title, explanation of given chapter in detail, code examples (code field <precode> format) if applicable.`;

      try {
        // Generate course content
        const result = await generateCourseChapters.sendMessage(PROMPT);
        const contentItems = await JSON.parse(result?.response?.text()!);

        // Generate an optimized YouTube search query using OpenAI
        const contentText = contentItems
          .map((item: any) => `${item.title}: ${item.explanation}`)
          .join("\n\n");

        let videoQuery = `${course!.courseName} ${
          chapter.chapter_name
        } tutorial`;

        try {
          const queryResponse = await openai.chat.completions.create({
            model: "gpt-4o-mini",
            messages: [
              {
                role: "system",
                content:
                  "You are a helpful assistant that generates concise, focused YouTube search queries.",
              },
              {
                role: "user",
                content: `Based on the following educational content for a course on "${course.courseName}", chapter "${chapter.chapter_name}", generate a specific YouTube search query (5-8 words) that would find the most relevant educational tutorial videos. Extract the most important keywords and concepts.\n\nCONTENT:\n${contentText}\n\nYOUTUBE SEARCH QUERY:`,
              },
            ],
            max_tokens: 50,
            temperature: 0.7,
          });

          const generatedQuery =
            queryResponse.choices[0]?.message?.content?.trim() || "";
          if (generatedQuery && generatedQuery.length > 0) {
            videoQuery = generatedQuery;
          }
        } catch (error) {
          console.log("Error generating optimized query:", error);
          // Fall back to default query format
        }

        console.log("AI-generated YouTube query:", videoQuery);

        let videoId = "";

        try {
          const videoResp = await getYoutubeVideos(videoQuery);
          if (videoResp && videoResp.length > 0) {
            videoId = videoResp[0].id.videoId;
          }
        } catch (error) {
          console.log(
            `Error fetching video for chapter ${chapter.chapter_name}:`,
            error
          );
        }

        // Insert into the database
        await db.insert(CourseChapters).values({
          chapterId: index,
          courseId: course.courseId,
          content: contentItems,
          videoId: videoId,
        });
      } catch (error) {
        console.log(`Error in processing chapter ${index}:`, error);
      }
    });

    await Promise.all(chapterPromises!);
  } catch (error) {
    console.log(error);
  } finally {
    setLoading(false);
  }
};
