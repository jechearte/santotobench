import type { Metadata } from "next";
import Link from "next/link";

export const metadata: Metadata = {
  title: "About | SantotoBench",
  description:
    "Description of the benchmark that evaluates LLM agents managing a txistorra stand.",
};

export default function AboutPage() {
  return (
    <div className="max-w-4xl mx-auto space-y-8 text-pizarra-800">
      <h2 className="text-2xl font-bold text-sidra-600">What is SantotoBench?</h2>

      <section className="space-y-3">
        <p>
          SantotoBench is a benchmark that measures an AI agent&apos;s ability to manage a txistorra sandwich and cider stand.
        </p>
        <p>
          Every year on December 21st, the Santo Tomás fair is celebrated in San Sebastián (Spain), a popular festival where the main protagonists are cider and txistorra. In the city center, many stands selling pintxos and txistorra sandwiches are set up.
        </p>
        <p>
          The benchmark is inspired by this festival, and the AI agent&apos;s objective is to manage one of these stands.
        </p>
      </section>

      <section className="space-y-3">
        <h2 className="text-2xl font-semibold text-sidra-600">What is the agent&apos;s objective?</h2>
        <p>
          The agent&apos;s objective is simple: maximize cash at the end of the day.
        </p>
      </section>

      <section className="space-y-3">
        <h2 className="text-2xl font-semibold text-sidra-600">What actions can the agent perform?</h2>
        <p>
          The stand managed by the agent opens at 10am and closes at 8pm. The agent starts the day with €500 in cash and some stock. In each turn, the agent can perform the following actions:
        </p>
        <ul className="list-disc list-inside space-y-2 ml-4">
          <li>
            <strong>Buy more stock:</strong> The initial stock is insufficient to meet all the stand&apos;s demand. If the agent doesn&apos;t want to run out of stock at some point, it must buy more ingredient stock.
          </li>
          <li>
            <strong>Assign tasks to workers:</strong> There are 8 workers at the stand and 4 types of tasks: fry txistorra, prepare pintxos and sandwiches, serve customers, open cider bottles. If the agent doesn&apos;t assign tasks to workers, they won&apos;t work. The agent must decide which task to assign to each worker.
          </li>
          <li>
            <strong>Modify prices:</strong> The stand sells 3 products (txistorra pintxos, txistorra sandwiches, cider bottles). Each product has an initial price, but the agent can modify prices at any time.
          </li>
        </ul>
        <p>
          Each turn represents a 15-minute period. After the agent has performed the actions it considers necessary, product demand is simulated for the next 15 minutes and the agent can perform more actions again. The simulation consists of 40 turns in total: 10 hours / 15 minutes.
        </p>
      </section>

      <section className="space-y-3">
        <h2 className="text-2xl font-semibold text-sidra-600">What framework did I use to develop the agent?</h2>
        <p>
          I didn&apos;t use any framework. The code simply makes requests to the provider&apos;s API using tool calling. In the system prompt, the model is explained the game rules, and in each turn a message is sent indicating the orders delivered in the last 15 minutes.
        </p>
        <p>
          Evaluations have been conducted with models from 4 different providers: OpenAI, Gemini, Anthropic, xAI. In all cases, the official SDKs are being used.
        </p>
        <p>
          The tools available to the agent are as follows:
        </p>
        <ul className="list-disc list-inside space-y-2 ml-4">
          <li><strong>get_status:</strong> allows obtaining information about available cash and stock</li>
          <li><strong>get_prices:</strong> allows knowing current prices</li>
          <li><strong>set_prices:</strong> allows editing prices</li>
          <li><strong>place_order:</strong> allows buying more ingredient stock</li>
          <li><strong>assign_workers:</strong> allows assigning tasks to workers</li>
          <li><strong>end_turn:</strong> must use this tool when it doesn&apos;t want to perform more actions and wants to advance to the next turn</li>
        </ul>
      </section>

      <section className="space-y-3">
        <h2 className="text-2xl font-semibold text-sidra-600">How is the final score calculated?</h2>
        <p>
          The score is the cash generated throughout the day, which equals final cash - initial cash.
        </p>
        <p>
          When evaluating the same model multiple times under the same conditions, I have observed that there is high variance between results. To reduce the effect of variance on the score used to create the leaderboard, I have evaluated each model 3 times and kept the median result.
        </p>
        <p>
          Ideally, the sample size would be increased. Evaluate each model more times, at least 5, but I don&apos;t have enough budget for that.
        </p>
      </section>
    </div>
  );
}

