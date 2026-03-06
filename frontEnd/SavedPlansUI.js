const { useState, useEffect } = React;

// Displays a searchable, filterable list of saved schedule plans (single & multi-semester)
function SavedPlansUI({ userData, onLogout, onBack, onSelectPlan, onPlanDeleted, refreshKey }) {
	const [savedPlans, setSavedPlans] = useState([]);
	const [searchQuery, setSearchQuery] = useState("");
	const [isLoading, setIsLoading] = useState(true);
	const [filter, setFilter] = useState("all"); // "all" | "single" | "multi"

	// Credit lookup: maps "DEPT CODE" -> credit count from course catalog
	const [creditsByDeptCode, setCreditsByDeptCode] = useState({});
	const [catalogReady, setCatalogReady] = useState(false);
	// Holds computed credits for plans that don't have them stored server-side
	const [computedCredits, setComputedCredits] = useState({});
	const [creditsReady, setCreditsReady] = useState(false);

	const BASE_URL = "http://136.36.121.11:8000";
	// Fetch full course catalog on mount to build credit lookup map
	useEffect(() => {
		(async () => {
			try {
				const res = await fetch(`${BASE_URL}/schedule/get_courses`);
				if (res.ok) {
					const courses = await res.json();
					const map = {};
					courses.forEach(c => {
						const credits = typeof c.credits === "number" ? c.credits : parseFloat(c.credits) || 0;
						if (c.department && c.course_code) {
							map[`${c.department.toUpperCase()} ${c.course_code}`] = credits;
						}
					});
					setCreditsByDeptCode(map);
				}
			} catch (e) { console.warn("[SavedPlansUI] failed to fetch course catalog:", e); }
			finally { setCatalogReady(true); }
		})();
	}, []);

	// Extract "DEPT CODE" key from a class name string (e.g. "CS 101 - Intro" -> "CS 101")
	const parseDeptCode = (className) => {
		if (!className || typeof className !== "string") return null;
		const match = className.match(/^([A-Z]+)\s+(\d+)/);
		return match ? `${match[1]} ${match[2]}` : null;
	};

	// Sum credits for all unique courses in a schedule using the catalog lookup
	const computeCreditsFromSchedule = (schedule, lookup) => {
		const seen = new Set();
		let total = 0;
		(schedule || []).forEach(item => {
			const key = parseDeptCode(item.class_ || "");
			if (key && !seen.has(key)) {
				seen.add(key);
				total += lookup[key] || 0;
			}
		});
		return total;
	};

	// Fetch user's saved plans list whenever user or refreshKey changes
	useEffect(() => {
		if (!userData?.id) return;
		(async () => {
			try {
				setIsLoading(true);
				const res = await fetch(`${BASE_URL}/plans?user_id=${userData.id}`);
				if (!res.ok) throw new Error(await res.text());
				setSavedPlans(await res.json());
			} catch (err) { console.error("Failed to fetch plans:", err); setSavedPlans([]); }
			finally { setIsLoading(false); }
		})();
	}, [userData, refreshKey]);

	// For plans missing credit totals, fetch their full details and compute credits locally
	useEffect(() => {
		if (!catalogReady || isLoading || savedPlans.length === 0) return;

		const plansNeedingCredits = savedPlans.filter(
			p => (!p.total_credits || p.total_credits === 0) && (p.total_courses > 0)
		);

		if (plansNeedingCredits.length === 0) {
			setCreditsReady(true);
			return;
		}

		(async () => {
			const newCredits = {};
			await Promise.all(
				plansNeedingCredits.map(async (plan) => {
					try {
						const isMulti = plan.mode === "multi";
						const url = isMulti
							? `${BASE_URL}/plans/multi/${plan.id}?user_id=${userData.id}`
							: `${BASE_URL}/plans/${plan.id}?user_id=${userData.id}`;
						const res = await fetch(url);
						if (!res.ok) return;
						const detail = await res.json();

						// Multi-semester: sum credits across all semesters
						if (isMulti) {
							let total = 0;
							(detail.semesters || []).forEach(sem => {
								total += computeCreditsFromSchedule(sem.schedule, creditsByDeptCode);
							});
							if (total > 0) newCredits[plan.id] = total;
						} else {
							const credits = computeCreditsFromSchedule(detail.schedule, creditsByDeptCode);
							if (credits > 0) newCredits[plan.id] = credits;
						}
					} catch (e) {
						console.warn("[SavedPlansUI] failed to fetch plan detail:", plan.id, e);
					}
				})
			);
			setComputedCredits(newCredits);
			setCreditsReady(true);
		})();
	}, [savedPlans, catalogReady, isLoading]);

	// Mark credits ready immediately when no enrichment is needed
	useEffect(() => {
		if (!isLoading && savedPlans.length === 0) setCreditsReady(true);
		if (!isLoading && catalogReady && savedPlans.every(p => p.total_credits > 0 || p.total_courses === 0)) {
			setCreditsReady(true);
		}
	}, [isLoading, catalogReady, savedPlans]);

	// Prefer server-side credits; fall back to locally computed credits
	const getDisplayCredits = (plan) => {
		if (plan.total_credits > 0) return plan.total_credits;
		return computedCredits[plan.id] || 0;
	};

	// Block UI until both plan list and credit enrichment finish
	const showLoading = isLoading || !creditsReady;

	// Apply search query and type filter to plan list
	const filteredPlans = savedPlans.filter((plan) => {
		const matchesSearch =
			plan.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
			`${plan.term_season} ${plan.term_year}`.toLowerCase().includes(searchQuery.toLowerCase());
		const matchesFilter =
			filter === "all" ||
			(filter === "multi" && plan.mode === "multi") ||
			(filter === "single" && plan.mode !== "multi");
		return matchesSearch && matchesFilter;
	});

	return (
		<div className="flex flex-col h-screen bg-slate-100">
			{/* Header */}
			<header className="px-6 py-4 flex items-center justify-between shadow-sm" style={{ backgroundColor: "#BE0000" }}>
				<h1 className="text-xl font-semibold text-white">Saved Plans</h1>
			</header>

			<div className="flex-1 overflow-y-auto p-6">
				<div className="max-w-4xl mx-auto">
					{/* Search input + type filter toggle (All / Single / Multi) */}
					<div className="flex gap-3 mb-6">
						<div className="relative flex-1">
							<svg className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
								<path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
							</svg>
							<input type="text" value={searchQuery} onChange={(e) => setSearchQuery(e.target.value)} placeholder="Search plans..."
								className="w-full pl-10 pr-4 py-3 border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-red-500 focus:ring-opacity-50 bg-white"
							/>
						</div>
						<div className="flex gap-1 bg-white border border-slate-300 rounded-lg p-1">
							{[["all", "All"], ["single", "Single"], ["multi", "Multi"]].map(([val, label]) => (
								<button key={val} type="button" onClick={() => setFilter(val)}
									className="px-3 py-1.5 rounded-md text-sm font-medium transition-all"
									style={filter === val ? { backgroundColor: val === "multi" ? "#7c3aed" : "#BE0000", color: "#fff" } : { color: "#64748b" }}
								>{label}</button>
							))}
						</div>
					</div>

					{/* Plan cards list — loading / empty / results */}
					<div className="space-y-3">
						{showLoading ? (
							<div className="text-center py-12">
								<div className="animate-spin rounded-full h-8 w-8 border-b-2 mx-auto mb-3" style={{ borderColor: "#BE0000" }}></div>
								<p className="text-slate-500">Loading plans...</p>
							</div>
						) : filteredPlans.length === 0 ? (
							<div className="text-center py-12">
								<p className="text-slate-500">No plans found</p>
							</div>
						) : (
							filteredPlans.map((plan) => {
								const isMulti = plan.mode === "multi";
								const displayCredits = getDisplayCredits(plan);
								return (
									// Clickable plan card — fetches full plan detail on click
									<div key={plan.id}
										onClick={async () => {
											try {
												const url = isMulti
													? `${BASE_URL}/plans/multi/${plan.id}?user_id=${userData.id}`
													: `${BASE_URL}/plans/${plan.id}?user_id=${userData.id}`;
												const res = await fetch(url);
												if (!res.ok) throw new Error(await res.text());
												onSelectPlan(await res.json());
											} catch (err) { console.error("Failed to load plan:", err); alert("Could not load plan"); }
										}}
										className="relative cursor-pointer group rounded-xl shadow-sm hover:shadow-lg transition-all duration-200 overflow-hidden"
									>
										{/* Colored left accent bar (purple for multi, red for single) */}
										<div className="absolute left-0 top-0 bottom-0 w-1.5" style={{ backgroundColor: isMulti ? "#7c3aed" : "#BE0000" }} />

										<div className="pl-5 pr-5 py-4"
											style={{
												background: isMulti ? "linear-gradient(135deg, #faf5ff 0%, #ffffff 60%)" : "#ffffff",
												border: isMulti ? "1px solid #e9d5ff" : "1px solid #e2e8f0",
												borderLeft: "none", borderRadius: "0 0.75rem 0.75rem 0",
											}}
										>
											{/* Delete button — visible on hover */}
											<button
												onClick={async (e) => {
													e.stopPropagation();
													try {
														const res = await fetch(`${BASE_URL}/plans/${plan.id}?user_id=${userData.id}`, { method: "DELETE" });
														if (!res.ok) throw new Error(await res.text());
														setSavedPlans(savedPlans.filter(p => p.id !== plan.id));
														if (onPlanDeleted) onPlanDeleted();
													} catch (err) { alert("Could not delete plan"); }
												}}
												className="absolute top-3.5 right-3.5 w-7 h-7 rounded-lg flex items-center justify-center transition-all opacity-0 group-hover:opacity-100 text-slate-400 hover:text-white hover:bg-red-500 z-10"
												title="Delete plan"
											>
												<svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
													<path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
												</svg>
											</button>

											<div className="flex items-center gap-3 pr-8">
												{/* Plan type icon */}
												<div className="w-10 h-10 rounded-xl flex items-center justify-center flex-shrink-0"
													style={{ backgroundColor: isMulti ? "#ede9fe" : "#fff0f0" }}
												>
													{isMulti ? (
														<svg className="w-5 h-5" fill="none" stroke="#7c3aed" viewBox="0 0 24 24">
															<path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.8} d="M19 11H5m14 0a2 2 0 012 2v6a2 2 0 01-2 2H5a2 2 0 01-2-2v-6a2 2 0 012-2m14 0V9a2 2 0 00-2-2M5 11V9a2 2 0 012-2m0 0V5a2 2 0 012-2h6a2 2 0 012 2v2M7 7h10" />
														</svg>
													) : (
														<svg className="w-5 h-5" fill="none" stroke="#BE0000" viewBox="0 0 24 24">
															<path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.8} d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z" />
														</svg>
													)}
												</div>

												{/* Plan name and metadata (term, courses, credits, date) */}
												<div className="flex-1 min-w-0">
													<div className="flex items-center gap-2 mb-1">
														<span className="text-base font-bold text-slate-800 truncate group-hover:text-slate-900">{plan.name}</span>
													</div>

													{/* Subtitle: term info · course/semester count · last updated */}
													<div className="flex items-center gap-3 text-xs text-slate-500">
														<span>
															{isMulti
																? `${plan.semester_count || 0} semester${(plan.semester_count || 0) !== 1 ? "s" : ""}`
																: `${plan.total_courses || 0} course${(plan.total_courses || 0) !== 1 ? "s" : ""} · ${displayCredits} credit${displayCredits !== 1 ? "s" : ""}`
															}
														</span></div>
												</div>

												{/* Date + Hover arrow indicator */}
												<div className="flex items-center gap-2 flex-shrink-0">
													<span className="text-xs text-slate-400">
														{plan.updated_at
															? (() => {
																const raw = plan.updated_at;
																const d = new Date(raw.endsWith("Z") ? raw : raw + "Z");
																if (isNaN(d.getTime())) return "—";
																return d.toLocaleDateString(undefined, { month: "short", day: "numeric", year: "numeric" })
																	+ " · "
																	+ d.toLocaleTimeString(undefined, { hour: "numeric", minute: "2-digit" });
															})()
															: "—"
														}
													</span>
													<svg className="w-4 h-4 flex-shrink-0 opacity-0 group-hover:opacity-100 transition-all -translate-x-1 group-hover:translate-x-0"
														fill="none" stroke="currentColor" viewBox="0 0 24 24"
														style={{ color: isMulti ? "#7c3aed" : "#BE0000" }}
													>
														<path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
													</svg>
												</div>
											</div>
										</div>
									</div>
								);
							})
						)}
					</div>
				</div>
			</div>
		</div>
	);
}