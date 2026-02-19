const { useState, useEffect } = React;

function SavedPlansUI({ userData, onLogout, onBack, onSelectPlan, onPlanDeleted }) {
	const [savedPlans, setSavedPlans] = useState([]);
	const [searchQuery, setSearchQuery] = useState("");
	const [isLoading, setIsLoading] = useState(true);

	useEffect(() => {
		if (!userData?.id) return;

		const fetchPlans = async () => {
			try {
				setIsLoading(true);

				const res = await fetch(
					`http://localhost:8000/plans?user_id=${userData.id}`
				);

				if (!res.ok) {
					const errText = await res.text();
					throw new Error(errText);
				}

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
	}, [userData]);

	const filteredPlans = savedPlans.filter((plan) =>
		plan.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
		`${plan.term_season} ${plan.term_year}`
			.toLowerCase()
			.includes(searchQuery.toLowerCase())
	);

	return (
		<div className="flex flex-col h-screen bg-slate-100">
			<header
				className="px-6 py-4 flex items-center justify-between shadow-sm"
				style={{ backgroundColor: "#BE0000" }}
			>
				<div className="flex items-center gap-3">
					<h1 className="text-xl font-semibold text-white">Saved Plans</h1>
				</div>

				<div className="flex items-center gap-3">
					<span className="text-white text-sm">
						{userData?.username}
					</span>
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
					<div className="mb-6">
						<input
							type="text"
							value={searchQuery}
							onChange={(e) => setSearchQuery(e.target.value)}
							placeholder="Search plans..."
							className="w-full px-4 py-3 border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-red-500 focus:ring-opacity-50"
						/>
					</div>

					<div className="space-y-4">
						{isLoading ? (
							<div className="text-center py-12">
								<p className="text-slate-500">Loading plans...</p>
							</div>
						) : filteredPlans.length === 0 ? (
							<div className="text-center py-12">
								<p className="text-slate-500">No plans found</p>
							</div>
						) : (
							filteredPlans.map((plan) => (
								<div
									key={plan.id}
									onClick={async () => {
										try {
											const res = await fetch(
												`http://localhost:8000/plans/${plan.id}?user_id=${userData.id}`
											);

											if (!res.ok) {
												const errText = await res.text();
												throw new Error(errText);
											}

											const fullPlan = await res.json();

											onSelectPlan(fullPlan);
										} catch (err) {
											console.error("Failed to load full plan:", err);
											alert("Could not load plan");
										}
									}}
									className="bg-white rounded-xl shadow-md hover:shadow-xl transition-all duration-300 cursor-pointer group p-6 border-2 border-transparent hover:border-red-700 relative"
								>
									<button
										onClick={async (e) => {
											e.stopPropagation();
											if (!confirm(`Are you sure you want to delete "${plan.name}"?`)) {
												return;
											}
											
											try {
												const res = await fetch(
													`http://localhost:8000/plans/${plan.id}?user_id=${userData.id}`,
													{ method: 'DELETE' }
												);

												if (!res.ok) {
													const errText = await res.text();
													throw new Error(errText);
												}

												// Refresh the plans list
												setSavedPlans(savedPlans.filter(p => p.id !== plan.id));
												if (onPlanDeleted) onPlanDeleted();
											} catch (err) {
												console.error("Failed to delete plan:", err);
												alert("Could not delete plan");
											}
										}}
										className="absolute top-4 right-4 w-10 h-10 bg-red-600 hover:bg-red-700 text-white rounded-lg flex items-center justify-center transition-all shadow-md hover:shadow-lg font-bold text-xl z-10"
										title="Delete plan"
									>
										×
									</button>

									<div className="flex justify-between items-start mb-3 pr-12">
										<div className="flex-1">
											<h3 className="text-xl font-bold text-slate-800 group-hover:text-red-700 transition-colors mb-1">
												{plan.name}
											</h3>

											<div className="flex items-center gap-4 text-sm text-slate-600">
												<span>
													{new Date(plan.created_at).toLocaleDateString()}
												</span>

												<span>
													{plan.total_courses || 0} courses
												</span>
											</div>
										</div>

										<span className="px-3 py-1 bg-slate-100 text-slate-700 rounded-full text-sm font-medium">
											{plan.term_season} {plan.term_year}
										</span>
									</div>

									<div
										className="flex items-center justify-end gap-2 text-sm font-medium"
										style={{ color: "#BE0000" }}
									>
										<span>Open Plan</span>
									</div>
								</div>
							))
						)}
					</div>
				</div>
			</div>
		</div>
	);
}