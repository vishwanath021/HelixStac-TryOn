import { quoteBenchmark } from "../src/lib/ai/benchmark";

const samples = [
  { label: "square", width: 1024, height: 1024 },
  { label: "landscape", width: 1280, height: 720 },
  { label: "portrait", width: 720, height: 1280 },
];

for (const sample of samples) {
  const quote = quoteBenchmark(sample.width, sample.height);
  if (!quote.ok) {
    console.log(sample.label, quote.message);
    process.exitCode = 1;
    continue;
  }
  console.log(
    `${sample.label} ${sample.width}x${sample.height} -> ${quote.model} ${quote.quality} ${quote.size} fidelity=${quote.inputFidelity} format=${quote.outputFormat} n=${quote.n} output≈$${quote.estimateUsd} ≈₹${quote.estimateInr} cap=₹${quote.capInr}`,
  );
}
console.log("No provider call was made. A paid run is the super-admin button on /super/ai.");
