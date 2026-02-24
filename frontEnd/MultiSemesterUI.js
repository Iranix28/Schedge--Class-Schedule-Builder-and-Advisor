const { useState, useEffect, useRef } = React;

function MultiSemesterUI({ userData, onLogout, onSelectSemester, savedPlan, onPlanSaved, onPlanCreated, onPlanIdSaved, initialTitle, onTitleChange, planId }) {
	const BASE_URL = "http://localhost:8000";
	const [plannerTitle, setPlannerTitle] = useState(initialTitle || "");
	const [isEditingTitle, setIsEditingTitle] = useState(false);
	const [isSaving, setIsSaving] = useState(false);
	// Track the plan id once created/saved so semester clicks get _existingPlanId injected
	const [activePlanId, setActivePlanId] = useState(null);
	const titleMountedRef = useRef(false);

	// Keep activePlanId in sync with planId prop and savedPlan
	useEffect(() => {
		setActivePlanId(savedPlan?.id || planId || null);
	}, [savedPlan, planId]);

	// Sync title up to parent whenever it changes so it survives navigation
	const handleTitleChange = (val) => {
		setPlannerTitle(val);
		if (onTitleChange) onTitleChange(val);
	};

	// Debounced autosave of plan name — only when plan already exists in DB
	useEffect(() => {
		if (!titleMountedRef.current) {
			titleMountedRef.current = true;
			return;
		}
		const currentPlanId = activePlanId;
		if (!currentPlanId || !userData?.id || !plannerTitle.trim()) return;

		const timer = setTimeout(async () => {
			try {
				await fetch(`${BASE_URL}/plans/${currentPlanId}/name`, {
					method: "PATCH",
					headers: { "Content-Type": "application/json" },
					body: JSON.stringify({ user_id: userData.id, name: plannerTitle.trim() }),
				});
				if (onPlanSaved) onPlanSaved();
			} catch (e) {
				console.error("[MultiSemesterUI] failed to autosave plan name:", e);
			}
		}, 1000);
		return () => clearTimeout(timer);
	}, [plannerTitle]);

	// Function to get the next semester based on current date
	const getNextSemester = () => {
		const now = new Date();
		const month = now.getMonth();
		const year = now.getFullYear();
		if (month >= 0 && month <= 3) return { term: "Summer", year };
		if (month >= 4 && month <= 6) return { term: "Fall", year };
		return { term: "Spring", year: year + 1 };
	};

	const buildInitialSemesters = () => {
		if (savedPlan && savedPlan.semesters && savedPlan.semesters.length > 0) {
			return savedPlan.semesters.map((sem, idx) => ({
				id: idx + 1,
				name: `${sem.term_season} ${sem.term_year}`,
				year: sem.term_year,
				term: sem.term_season,
				credits: 0,
				courses: sem.courses || [],
				plan_id: savedPlan.id,
				semester_db_id: sem.id,
				messages: sem.messages || [],
				schedule: sem.schedule || [],
			}));
		}
		const initialSemester = getNextSemester();
		return [{
			id: 1,
			name: `${initialSemester.term} ${initialSemester.year}`,
			year: initialSemester.year,
			term: initialSemester.term,
			credits: 0,
			courses: [],
		}];
	};

	useEffect(() => {
		if (savedPlan) {
			handleTitleChange(savedPlan.name || "");
		}
	}, [savedPlan]);

	const [semesters, setSemesters] = useState(buildInitialSemesters);

	const pulseStyle = `
		@keyframes pulseBorder {
			0%, 100% { border-color: #cbd5e1; }
			50% { border-color: #BE0000; }
		}
		.pulse-border { animation: pulseBorder 2s ease-in-out infinite; }
	`;

	const handleAddSemester = () => {
		const lastSemester = semesters[semesters.length - 1];
		let newTerm, newYear;
		if (lastSemester.term === "Spring") { newTerm = "Summer"; newYear = lastSemester.year; }
		else if (lastSemester.term === "Summer") { newTerm = "Fall"; newYear = lastSemester.year; }
		else { newTerm = "Spring"; newYear = lastSemester.year + 1; }

		setSemesters([...semesters, {
			id: semesters.length + 1,
			name: `${newTerm} ${newYear}`,
			year: newYear,
			term: newTerm,
			credits: 0,
			courses: [],
		}]);
	};

	const handleRemoveSemester = (semesterId) => {
		if (semesters.length <= 1) { alert("You must have at least one semester"); return; }
		setSemesters(semesters.filter(sem => sem.id !== semesterId));
	};

	const handleSavePlan = async () => {
		if (!userData?.id) { alert("User not loaded"); return; }

		const name = plannerTitle.trim() || "Multi-Semester Plan";
		const existingPlanId = activePlanId;

		const payload = {
			user_id: userData.id,
			name,
			semesters: semesters.map(sem => ({
				term_season: sem.term,
				term_year: sem.year,
				courses: sem.courses || [],
			})),
		};

		try {
			setIsSaving(true);
			const url = existingPlanId
				? `${BASE_URL}/plans/multi/${existingPlanId}`
				: `${BASE_URL}/plans/multi`;
			const method = existingPlanId ? "PUT" : "POST";

			const res = await fetch(url, { method, headers: { "Content-Type": "application/json" }, body: JSON.stringify(payload) });
			if (!res.ok) throw new Error(await res.text());

			const data = await res.json();

			if (!existingPlanId && data.id) {
				// Fresh plan just created — store id locally so semester clicks use it
				setActivePlanId(data.id);
				// Notify App to store the plan id (without touching selectedSemester)
				if (onPlanIdSaved) onPlanIdSaved(data.id);
			}

			// Fetch the full plan to get real semester_db_ids for all semesters
			// so clicking any semester immediately has proper DB ids for autosave
			const savedPlanId = existingPlanId || data.id;
			try {
				const detailRes = await fetch(`${BASE_URL}/plans/multi/${savedPlanId}?user_id=${userData.id}`);
				if (detailRes.ok) {
					const fullPlan = await detailRes.json();
					setSemesters(fullPlan.semesters.map((sem, idx) => ({
						id: idx + 1,
						name: `${sem.term_season} ${sem.term_year}`,
						year: sem.term_year,
						term: sem.term_season,
						credits: 0,
						courses: sem.courses || [],
						plan_id: savedPlanId,
						semester_db_id: sem.id,
						messages: sem.messages || [],
						schedule: sem.schedule || [],
					})));
				}
			} catch (e) {
				console.error("[MultiSemesterUI] failed to refresh semesters after save:", e);
			}

			if (onPlanSaved) onPlanSaved();
			alert(existingPlanId ? "Plan updated!" : "Multi-semester plan saved!");
		} catch (err) {
			console.error("Save error:", err);
			alert("Error saving plan: " + err.message);
		} finally {
			setIsSaving(false);
		}
	};

	return (
		<div className="flex flex-col h-screen bg-slate-100">
			<style>{pulseStyle}</style>

			<header className="px-6 py-4 flex items-center justify-between shadow-sm" style={{ backgroundColor: "#BE0000" }}>
				<div className="flex items-center gap-3">
					{isEditingTitle ? (
						<input
							type="text"
							value={plannerTitle}
							autoFocus
							onChange={(e) => handleTitleChange(e.target.value)}
							onBlur={() => setIsEditingTitle(false)}
							onKeyDown={(e) => { if (e.key === "Enter") setIsEditingTitle(false); }}
							placeholder="Multi-Semester Planner"
							className="text-xl font-semibold bg-transparent border-b border-white text-white outline-none"
						/>
					) : (
						<h1 onClick={() => setIsEditingTitle(true)} className="text-xl font-semibold text-white cursor-pointer">
							{plannerTitle.trim() !== "" ? plannerTitle : "Multi-Semester Planner"}
						</h1>
					)}
				</div>
				<div className="flex items-center gap-3">
					<span className="text-white text-sm">{userData?.username}</span>
					<button type="button" onClick={onLogout} className="px-3 py-1.5 bg-white font-medium rounded hover:bg-slate-100 transition-all shadow-sm text-sm" style={{ color: "#BE0000" }}>
						Logout
					</button>
				</div>
			</header>

			<div className="flex-1 overflow-y-auto p-6">
				<div className="max-w-6xl mx-auto">
					<div className="mb-6">
						<h2 className="text-3xl font-bold text-slate-800 mb-2">Plan Your Academic Journey</h2>
						<p className="text-slate-600">Click on any semester to start planning your courses</p>
					</div>

					<div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4 mb-6">
						{semesters.map((semester, index) => (
							<div
								key={semester.id}
								onClick={() => {
									const currentPlanId = activePlanId || null;
									const semesterWithContext = {
										...semester,
										_planTitle: plannerTitle.trim() || "Multi-Semester Plan",
										_allSemesters: semesters,
										...(currentPlanId && !semester.plan_id ? { _existingPlanId: currentPlanId } : {}),
									};
									onSelectSemester(semesterWithContext);
								}}
								className="bg-white rounded-xl shadow-md hover:shadow-xl transition-all duration-300 cursor-pointer group hover:scale-105 border-2 border-transparent hover:border-red-700"
							>
								<div className="p-6">
									<div className="flex justify-between items-start mb-3">
										<div>
											<div className="flex items-center gap-2 mb-1">
												<span className="text-sm font-semibold text-slate-500">Semester {index + 1}</span>
											</div>
											<h3 className="text-xl font-bold text-slate-800 group-hover:text-red-700 transition-colors">{semester.name}</h3>
										</div>
										{semesters.length > 1 && (
											<button type="button" onClick={(e) => { e.stopPropagation(); handleRemoveSemester(semester.id); }} className="text-slate-400 hover:text-red-600 transition-colors" title="Remove semester">
												<svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
													<path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
												</svg>
											</button>
										)}
									</div>

									<div className="space-y-2">
										<div className="flex items-center gap-2 text-sm text-slate-600">
											<svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
												<path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 6.253v13m0-13C10.832 5.477 9.246 5 7.5 5S4.168 5.477 3 6.253v13C4.168 18.477 5.754 18 7.5 18s3.332.477 4.5 1.253m0-13C13.168 5.477 14.754 5 16.5 5c1.747 0 3.332.477 4.5 1.253v13C19.832 18.477 18.247 18 16.5 18c-1.746 0-3.332.477-4.5 1.253" />
											</svg>
											<span>{semester.courses.length} courses</span>
										</div>
										<div className="flex items-center gap-2 text-sm text-slate-600">
											<svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
												<path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
											</svg>
											<span>{semester.credits} credits</span>
										</div>
									</div>

									<div className="mt-4 pt-4 border-t border-slate-200">
										<div className="flex items-center justify-between text-sm">
											<span className="text-slate-500">Status</span>
											<span className="px-2 py-1 bg-slate-100 text-slate-700 rounded-full text-xs font-medium">
												{semester.courses.length > 0 ? "In Progress" : "Not Started"}
											</span>
										</div>
									</div>
								</div>

								<div className="px-6 py-3 border-t border-slate-100 flex items-center justify-center gap-2 text-sm font-medium group-hover:bg-red-50 transition-colors" style={{ color: "#BE0000" }}>
									<span>Plan This Semester</span>
									<svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
										<path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
									</svg>
								</div>
							</div>
						))}
					</div>

					<button
						type="button"
						onClick={handleAddSemester}
						className={"w-full py-4 border-2 border-dashed rounded-xl hover:border-red-700 hover:bg-red-50 transition-all flex items-center justify-center gap-2 text-slate-600 hover:text-red-700 font-medium " + (semesters.length === 1 ? "pulse-border" : "border-slate-300")}
					>
						<svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
							<path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
						</svg>
						Add Another Semester
					</button>

					<button
						type="button"
						onClick={handleSavePlan}
						disabled={isSaving}
						className="w-full mt-3 py-4 rounded-xl font-semibold text-white transition-all shadow-sm disabled:opacity-60 flex items-center justify-center gap-2"
						style={{ backgroundColor: "#BE0000" }}
					>
						<svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
							<path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
						</svg>
						{isSaving ? "Saving..." : "Save Plan"}
					</button>

					<div className="mt-6 bg-white rounded-xl shadow-md p-6">
						<h3 className="text-lg font-semibold text-slate-800 mb-4">Degree Summary</h3>
						<div className="grid grid-cols-3 gap-4">
							<div className="text-center">
								<div className="text-3xl font-bold text-slate-800">{semesters.length}</div>
								<div className="text-sm text-slate-600">Total Semesters</div>
							</div>
							<div className="text-center">
								<div className="text-3xl font-bold text-slate-800">{semesters.reduce((sum, sem) => sum + sem.courses.length, 0)}</div>
								<div className="text-sm text-slate-600">Total Courses</div>
							</div>
							<div className="text-center">
								<div className="text-3xl font-bold text-slate-800">{semesters.reduce((sum, sem) => sum + sem.credits, 0)}</div>
								<div className="text-sm text-slate-600">Total Credits</div>
							</div>
						</div>
					</div>
				</div>
			</div>
		</div>
	);
}