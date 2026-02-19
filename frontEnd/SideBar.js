const { useState, useEffect, useRef } = React;

function Sidebar({ userData, onNewChat, onSelectSavedPlan, onNavigate, refreshKey }) {
	const [savedPlans, setSavedPlans] = useState([]);
	const [isLoadingPlans, setIsLoadingPlans] = useState(false);
	const [searchQuery, setSearchQuery] = useState("");
	const [showSearch, setShowSearch] = useState(false);
	const searchInputRef = useRef(null);

	const BASE_URL = "http://localhost:8000";

	// Fetch saved plans on mount and when userData changes
	useEffect(() => {
		if (!userData?.id) return;
		fetchPlans();
	}, [userData, refreshKey]);

	// Auto-focus search input when search is toggled open
	useEffect(() => {
		if (showSearch && searchInputRef.current) {
			searchInputRef.current.focus();
		}
	}, [showSearch]);

	const fetchPlans = async () => {
		if (!userData?.id) return;
		try {
			setIsLoadingPlans(true);
			const res = await fetch(`${BASE_URL}/plans?user_id=${userData.id}`);
			if (!res.ok) throw new Error("Failed to fetch plans");
			const data = await res.json();
			setSavedPlans(data);
		} catch (err) {
			console.error("Failed to fetch plans:", err);
			setSavedPlans([]);
		} finally {
			setIsLoadingPlans(false);
		}
	};

	const handleDeletePlan = async (e, plan) => {
		e.stopPropagation();
		if (!confirm(`Delete "${plan.name}"?`)) return;

		try {
			const res = await fetch(
				`${BASE_URL}/plans/${plan.id}?user_id=${userData.id}`,
				{ method: "DELETE" }
			);
			if (!res.ok) throw new Error("Failed to delete plan");
			setSavedPlans((prev) => prev.filter((p) => p.id !== plan.id));
		} catch (err) {
			console.error("Failed to delete plan:", err);
			alert("Could not delete plan");
		}
	};

	const handleSelectPlan = async (plan) => {
		try {
			const res = await fetch(
				`${BASE_URL}/plans/${plan.id}?user_id=${userData.id}`
			);
			if (!res.ok) throw new Error("Failed to load plan");
			const fullPlan = await res.json();
			onSelectSavedPlan(fullPlan);
		} catch (err) {
			console.error("Failed to load full plan:", err);
			alert("Could not load plan");
		}
	};

	const filteredPlans = savedPlans.filter((plan) =>
		plan.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
		`${plan.term_season} ${plan.term_year}`
			.toLowerCase()
			.includes(searchQuery.toLowerCase())
	);

	return (
		<>
			{/* Sidebar - always visible */}
			<div
				className="fixed top-0 left-0 h-full z-40 flex flex-col"
				style={{
					width: "260px",
					backgroundColor: "#171717",
				}}
			>
				{/* Inner wrapper */}
				<div className="flex flex-col h-full" style={{ width: "260px", minWidth: "260px" }}>

					{/* Top section: Logo (Home) + New Chat */}
					<div className="flex items-center justify-between px-3 pt-3 pb-1">
						{/* Logo – click to go home */}
						<button
							onClick={() => onNavigate(null)}
							className="flex items-center gap-2 rounded-lg hover:opacity-80 transition-opacity"
							title="Home"
						>
							<div
								className="w-8 h-8 rounded-lg flex items-center justify-center"
								style={{ backgroundColor: "#BE0000" }}
							>
								<span className="text-white text-sm font-bold">S</span>
							</div>
						</button>
					</div>

					{/* Search */}
					<div className="px-2 pt-2 pb-1">
						{showSearch ? (
							<div className="relative">
								<svg className="absolute left-2.5 top-1/2 -translate-y-1/2 w-4 h-4 text-neutral-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
									<path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
								</svg>
								<input
									ref={searchInputRef}
									type="text"
									value={searchQuery}
									onChange={(e) => setSearchQuery(e.target.value)}
									onBlur={() => {
										if (!searchQuery) setShowSearch(false);
									}}
									onKeyDown={(e) => {
										if (e.key === "Escape") {
											setSearchQuery("");
											setShowSearch(false);
										}
									}}
									placeholder="Search plans..."
									className="w-full pl-8 pr-3 py-2 text-sm rounded-lg border-0 outline-none text-neutral-200 placeholder-neutral-500"
									style={{ backgroundColor: "#2a2a2a" }}
								/>
							</div>
						) : (
							<button
								onClick={() => setShowSearch(true)}
								className="w-full flex items-center gap-2.5 px-3 py-2 rounded-lg text-sm text-neutral-400 hover:text-white hover:bg-neutral-800 transition-all"
							>
								<svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
									<path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
								</svg>
								<span>Search plans</span>
							</button>
						)}
					</div>

					{/* Navigation Items */}
					<div className="px-2 pt-1 pb-2 space-y-0.5">
						<NavItem
							icon={
								<svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
									<path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M3 12l2-2m0 0l7-7 7 7M5 10v10a1 1 0 001 1h3m10-11l2 2m-2-2v10a1 1 0 01-1 1h-3m-4 0a1 1 0 01-1-1v-4a1 1 0 011-1h2a1 1 0 011 1v4a1 1 0 01-1 1h-2z" />
								</svg>
							}
							label="Home"
							onClick={() => onNavigate(null)}
						/>

						<div className="mx-1 my-1 border-t border-neutral-800" />

						<div className="px-3 py-1.5 text-xs font-medium text-neutral-500 uppercase tracking-wider">
							New Plan
						</div>
						<NavItem
							icon={
								<svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
									<path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z" />
								</svg>
							}
							label="Single semester"
							onClick={() => onNavigate("single")}
						/>
						<NavItem
							icon={
								<svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
									<path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2" />
								</svg>
							}
							label="Multi-semester"
							onClick={() => onNavigate("multi")}
						/>
					</div>

					{/* Divider */}
					<div className="mx-3 border-t border-neutral-800" />

					{/* Saved Plans List */}
					<div className="flex-1 overflow-y-auto px-0 pt-2 pb-2" style={{ scrollbarWidth: "thin", scrollbarColor: "#404040 transparent" }}>
						{isLoadingPlans ? (
							<div className="px-3 py-4">
								<div className="flex items-center gap-2 text-neutral-500 text-sm">
									<svg className="w-4 h-4 animate-spin" fill="none" stroke="currentColor" viewBox="0 0 24 24">
										<circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
										<path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
									</svg>
									<span>Loading plans...</span>
								</div>
							</div>
						) : filteredPlans.length === 0 ? (
							<div className="px-3 py-4 text-neutral-500 text-sm text-center">
								{searchQuery ? "No matching plans" : "No saved plans yet"}
							</div>
						) : (
							<div className="mb-3">
								<button
									onClick={() => onNavigate("saved")}
									className="px-3 py-1.5 text-xs font-medium text-neutral-500 uppercase tracking-wider hover:text-white transition-colors cursor-pointer text-left"
								>
									Your Plans &rsaquo;
								</button>
								{filteredPlans.map((plan) => (
									<PlanItem
										key={plan.id}
										plan={plan}
										onSelect={() => handleSelectPlan(plan)}
										onDelete={(e) => handleDeletePlan(e, plan)}
									/>
								))}
							</div>
						)}
					</div>

					{/* Bottom section: User */}
					<div className="border-t border-neutral-800">
						<div className="px-2 py-2">
							<div className="flex items-center gap-2.5 px-3 py-2 rounded-lg hover:bg-neutral-800 transition-all cursor-pointer group">
								<div
									className="w-7 h-7 rounded-full flex items-center justify-center text-white text-xs font-semibold flex-shrink-0"
									style={{ backgroundColor: "#BE0000" }}
								>
									{(userData?.username || "U")[0].toUpperCase()}
								</div>
								<span className="text-sm text-neutral-300 truncate flex-1">
									{userData?.username || "User"}
								</span>
								<svg className="w-4 h-4 text-neutral-500 opacity-0 group-hover:opacity-100 transition-opacity" fill="none" stroke="currentColor" viewBox="0 0 24 24">
									<path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M8.625 12a.375.375 0 11-.75 0 .375.375 0 01.75 0zm4.125 0a.375.375 0 11-.75 0 .375.375 0 01.75 0zm4.125 0a.375.375 0 11-.75 0 .375.375 0 01.75 0z" />
								</svg>
							</div>
						</div>
					</div>
				</div>
			</div>

		</>
	);
}

/* ── Individual nav item ── */
function NavItem({ icon, label, onClick }) {
	return (
		<button
			onClick={onClick}
			className="w-full flex items-center gap-2.5 px-3 py-2 rounded-lg text-sm text-neutral-300 hover:text-white hover:bg-neutral-800 transition-all text-left"
		>
			<span className="flex-shrink-0 text-neutral-400">{icon}</span>
			<span>{label}</span>
		</button>
	);
}

/* ── Individual plan item in the sidebar list ── */
function PlanItem({ plan, onSelect, onDelete }) {
	const [hovered, setHovered] = useState(false);

	return (
		<div
			onClick={onSelect}
			onMouseEnter={() => setHovered(true)}
			onMouseLeave={() => setHovered(false)}
			className="group flex items-center gap-2 px-3 py-2 mx-1 rounded-lg cursor-pointer text-sm text-neutral-300 hover:text-white hover:bg-neutral-800 transition-all relative"
		>
			<svg className="w-4 h-4 text-neutral-500 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
				<path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M8 10h.01M12 10h.01M16 10h.01M9 16H5a2 2 0 01-2-2V6a2 2 0 012-2h14a2 2 0 012 2v8a2 2 0 01-2 2h-5l-5 5v-5z" />
			</svg>

			<span className="truncate flex-1">{plan.name}</span>

			{hovered && (
				<button
					onClick={onDelete}
					className="flex-shrink-0 w-6 h-6 rounded flex items-center justify-center text-neutral-500 hover:text-red-400 hover:bg-neutral-700 transition-all"
					title="Delete plan"
				>
					<svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
						<path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
					</svg>
				</button>
			)}
		</div>
	);
}