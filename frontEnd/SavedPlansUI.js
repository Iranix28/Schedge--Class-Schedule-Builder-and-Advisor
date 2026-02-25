const { useState, useEffect } = React;

function SavedPlansUI({ userData, onLogout, onBack, onSelectPlan, onPlanDeleted, refreshKey }) {
	const [savedPlans, setSavedPlans] = useState([]);
	const [searchQuery, setSearchQuery] = useState("");
	const [isLoading, setIsLoading] = useState(true);
	const [filter, setFilter] = useState("all"); // "all" | "single" | "multi"

	useEffect(() => {
		if (!userData?.id) return;

		const fetchPlans = async () => {
			try {
				setIsLoading(true);
				const res = await fetch(`http://localhost:8000/plans?user_id=${userData.id}`);
				if (!res.ok) throw new Error(await res.text());
				const data = await res.json();
				setSavedPlans(data);
			} catch (err) {
				console.error("Failed to fetch plans:", err);
				setSavedPlans([]);
			} finally {
				setIsLoading(false);
			}
		};

		fetchPlans();
	}, [userData, refreshKey]);

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

	const singleCount = savedPlans.filter(p => p.mode !== "multi").length;
	const multiCount = savedPlans.filter(p => p.mode === "multi").length;

	return (
		<div className="flex flex-col h-screen bg-slate-100">
			<header
				className="px-6 py-4 flex items-center justify-between shadow-sm"
				style={{ backgroundColor: "#BE0000" }}
			>
				<h1 className="text-xl font-semibold text-white">Saved Plans</h1>
				<div className="flex items-center gap-3">
					<span className="text-white text-sm">{userData?.username}</span>
					<button
						type="button"
						onClick={onLogout}
						className="px-3 py-1.5 bg-white font-medium rounded hover:bg-slate-100 transition-all shadow-sm text-sm"
						style={{ color: "#BE0000" }}
					>
						Logout
					</button>
				</div>
			</header>

			<div className="flex-1 overflow-y-auto p-6">
				<div className="max-w-4xl mx-auto">
					{/* Search + Filter row */}
					<div className="flex gap-3 mb-6">
						<div className="relative flex-1">
							<svg className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
								<path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
							</svg>
							<input
								type="text"
								value={searchQuery}
								onChange={(e) => setSearchQuery(e.target.value)}
								placeholder="Search plans..."
								className="w-full pl-10 pr-4 py-3 border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-red-500 focus:ring-opacity-50 bg-white"
							/>
						</div>
						<div className="flex gap-1 bg-white border border-slate-300 rounded-lg p-1">
							{[["all", "All"], ["single", "Single"], ["multi", "Multi"]].map(([val, label]) => (
								<button
									key={val}
									type="button"
									onClick={() => setFilter(val)}
									className="px-3 py-1.5 rounded-md text-sm font-medium transition-all"
									style={filter === val
										? { backgroundColor: val === "multi" ? "#7c3aed" : "#BE0000", color: "#fff" }
										: { color: "#64748b" }
									}
								>
									{label}
								</button>
							))}
						</div>
					</div>

					{/* Plan list */}
					<div className="space-y-3">
						{isLoading ? (
							<div className="text-center py-12">
								<p className="text-slate-500">Loading plans...</p>
							</div>
						) : filteredPlans.length === 0 ? (
							<div className="text-center py-12">
								<p className="text-slate-500">No plans found</p>
							</div>
						) : (
							filteredPlans.map((plan) => {
								const isMulti = plan.mode === "multi";
								return (
									<div
										key={plan.id}
										onClick={async () => {
											try {
												if (isMulti) {
													const res = await fetch(`http://localhost:8000/plans/multi/${plan.id}?user_id=${userData.id}`);
													if (!res.ok) throw new Error(await res.text());
													onSelectPlan(await res.json());
												} else {
													const res = await fetch(`http://localhost:8000/plans/${plan.id}?user_id=${userData.id}`);
													if (!res.ok) throw new Error(await res.text());
													onSelectPlan(await res.json());
												}
											} catch (err) {
												console.error("Failed to load plan:", err);
												alert("Could not load plan");
											}
										}}
										className="relative cursor-pointer group rounded-xl shadow-sm hover:shadow-lg transition-all duration-200 overflow-hidden"
									>
										{/* Colored left accent bar */}
										<div
											className="absolute left-0 top-0 bottom-0 w-1.5"
											style={{ backgroundColor: isMulti ? "#7c3aed" : "#BE0000" }}
										/>

										{/* Card */}
										<div
											className="pl-5 pr-5 py-4"
											style={{
												background: isMulti
													? "linear-gradient(135deg, #faf5ff 0%, #ffffff 60%)"
													: "#ffffff",
												border: isMulti
													? "1px solid #e9d5ff"
													: "1px solid #e2e8f0",
												borderLeft: "none",
												borderRadius: "0 0.75rem 0.75rem 0",
											}}
										>
											{/* Delete button */}
											<button
												onClick={async (e) => {
													e.stopPropagation();
													if (!confirm(`Delete "${plan.name}"?`)) return;
													try {
														const res = await fetch(
															`http://localhost:8000/plans/${plan.id}?user_id=${userData.id}`,
															{ method: "DELETE" }
														);
														if (!res.ok) throw new Error(await res.text());
														setSavedPlans(savedPlans.filter(p => p.id !== plan.id));
														if (onPlanDeleted) onPlanDeleted();
													} catch (err) {
														alert("Could not delete plan");
													}
												}}
												className="absolute top-3.5 right-3.5 w-7 h-7 rounded-lg flex items-center justify-center transition-all opacity-0 group-hover:opacity-100 text-slate-400 hover:text-white hover:bg-red-500 z-10"
												title="Delete plan"
											>
												<svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
													<path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
												</svg>
											</button>

											<div className="flex items-center gap-3 pr-8">
												{/* Icon bubble */}
												<div
													className="w-10 h-10 rounded-xl flex items-center justify-center flex-shrink-0"
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

												{/* Text content */}
												<div className="flex-1 min-w-0">
													<div className="flex items-center gap-2 mb-1">
														<span className="text-base font-bold text-slate-800 truncate group-hover:text-slate-900">
															{plan.name}
														</span>
														<span
															className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-semibold flex-shrink-0"
															style={isMulti
																? { backgroundColor: "#ede9fe", color: "#6d28d9" }
																: { backgroundColor: "#fff0f0", color: "#BE0000" }
															}
														>
															{isMulti ? (
																<>
																	<svg className="w-2.5 h-2.5" fill="currentColor" viewBox="0 0 20 20">
																		<path d="M2 6a2 2 0 012-2h12a2 2 0 012 2v2a2 2 0 01-2 2H4a2 2 0 01-2-2V6zM2 12a2 2 0 012-2h12a2 2 0 012 2v2a2 2 0 01-2 2H4a2 2 0 01-2-2v-2z"/>
																	</svg>
																	Multi
																</>
															) : (
																<>
																	<svg className="w-2.5 h-2.5" fill="currentColor" viewBox="0 0 20 20">
																		<path fillRule="evenodd" d="M6 2a1 1 0 00-1 1v1H4a2 2 0 00-2 2v10a2 2 0 002 2h12a2 2 0 002-2V6a2 2 0 00-2-2h-1V3a1 1 0 10-2 0v1H7V3a1 1 0 00-1-1zm0 5a1 1 0 000 2h8a1 1 0 100-2H6z" clipRule="evenodd"/>
																	</svg>
																	Single
																</>
															)}
														</span>
													</div>

													<div className="flex items-center gap-3 text-xs text-slate-500">
														<span>
															{isMulti ? "Multi-semester plan" : `${plan.term_season} ${plan.term_year}`}
														</span>
														<span className="text-slate-300">·</span>
														<span>
									{isMulti
										? `${plan.semester_count || 0} semester${(plan.semester_count || 0) !== 1 ? "s" : ""}`
										: `${plan.total_courses || 0} course${(plan.total_courses || 0) !== 1 ? "s" : ""} · ${plan.total_credits || 0} credit${(plan.total_credits || 0) !== 1 ? "s" : ""}`
									}
								</span>
														<span className="text-slate-300">·</span>
														<span>
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
													</div>
												</div>

												{/* Hover arrow */}
												<svg
													className="w-4 h-4 flex-shrink-0 opacity-0 group-hover:opacity-100 transition-all -translate-x-1 group-hover:translate-x-0"
													fill="none" stroke="currentColor" viewBox="0 0 24 24"
													style={{ color: isMulti ? "#7c3aed" : "#BE0000" }}
												>
													<path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
												</svg>
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