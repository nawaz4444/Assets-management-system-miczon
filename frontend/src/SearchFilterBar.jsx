import React from 'react';
import {
    Paper, InputBase, IconButton, Select, MenuItem, Stack, Chip, Box, Button, Divider, InputAdornment, FormControl, Select as MuiSelect
} from '@mui/material';
import SearchIcon from '@mui/icons-material/Search';
import FilterAltOffIcon from '@mui/icons-material/FilterAltOff';
import ClearIcon from '@mui/icons-material/Clear';

const SearchFilterBar = ({
    searchTerm, setSearchTerm,
    filterDept, setFilterDept,
    filterStatus, setFilterStatus,
    filterCategory, setFilterCategory,
    departments, uniqueCategories,
    clearFilters,
    children // For extra buttons like "Upload"
}) => {

    const hasActiveFilters = filterDept || filterStatus || filterCategory;

    // Common Select Style
    const selectStyle = {
        height: 40,
        minWidth: 150,
        fontSize: '0.9rem',
        '.MuiOutlinedInput-notchedOutline': { border: 'none' },
        '&:hover .MuiOutlinedInput-notchedOutline': { border: 'none' },
        '&.Mui-focused .MuiOutlinedInput-notchedOutline': { border: 'none' },
        backgroundColor: 'transparent'
    };

    const divider = <Divider orientation="vertical" flexItem sx={{ height: 28, m: 'auto 4px' }} />;

    return (
        <Box mb={3}>
            {/* MAIN BAR */}
            <Paper
                elevation={2}
                sx={{
                    p: '2px 4px',
                    display: 'flex',
                    alignItems: 'center',
                    flexWrap: 'wrap',
                    borderRadius: 2
                }}
            >
                {/* 1. SEARCH */}
                <Box sx={{ flex: 1, display: 'flex', alignItems: 'center', minWidth: '300px', p: 1 }}>
                    <SearchIcon sx={{ color: 'action.active', mr: 1 }} />
                    <InputBase
                        sx={{ flex: 1, ml: 1 }}
                        placeholder="Search by ID, Device, Serial, Custodian..."
                        value={searchTerm}
                        onChange={(e) => setSearchTerm(e.target.value)}
                    />
                    {searchTerm && (
                        <IconButton size="small" onClick={() => setSearchTerm('')}>
                            <ClearIcon fontSize="small" />
                        </IconButton>
                    )}
                </Box>

                {divider}

                {/* 2. FILTERS (Hidden on small screens logic could go here, for now we wrap) */}

                {/* Department Filter */}
                <FormControl variant="standard" sx={{ minWidth: 120, m: 1 }}>
                    <Select
                        displayEmpty
                        value={filterDept}
                        onChange={(e) => setFilterDept(e.target.value)}
                        disableUnderline
                        sx={{ ...selectStyle, fontWeight: filterDept ? 'bold' : 'normal', color: filterDept ? 'primary.main' : 'text.secondary' }}
                    >
                        <MenuItem value="">Department</MenuItem>
                        {departments.map(d => <MenuItem key={d.id} value={d.id}>{d.name}</MenuItem>)}
                    </Select>
                </FormControl>

                {divider}

                {/* Status Filter */}
                <FormControl variant="standard" sx={{ minWidth: 100, m: 1 }}>
                    <Select
                        displayEmpty
                        value={filterStatus}
                        onChange={(e) => setFilterStatus(e.target.value)}
                        disableUnderline
                        sx={{ ...selectStyle, fontWeight: filterStatus ? 'bold' : 'normal', color: filterStatus ? 'primary.main' : 'text.secondary' }}
                    >
                        <MenuItem value="">Status</MenuItem>
                        <MenuItem value="AVAILABLE">Available</MenuItem>
                        <MenuItem value="ASSIGNED">Assigned</MenuItem>
                        <MenuItem value="BROKEN">Broken</MenuItem>
                    </Select>
                </FormControl>

                {divider}

                {/* Category Filter */}
                <FormControl variant="standard" sx={{ minWidth: 110, m: 1 }}>
                    <Select
                        displayEmpty
                        value={filterCategory}
                        onChange={(e) => setFilterCategory(e.target.value)}
                        disableUnderline
                        sx={{ ...selectStyle, fontWeight: filterCategory ? 'bold' : 'normal', color: filterCategory ? 'primary.main' : 'text.secondary' }}
                    >
                        <MenuItem value="">Category</MenuItem>
                        {uniqueCategories.map((c, i) => <MenuItem key={i} value={c}>{c}</MenuItem>)}
                    </Select>
                </FormControl>

                {/* 3. EXTRA ACTIONS (Upload, etc.) */}
                {children && (
                    <>
                        {divider}
                        <Box px={1}>{children}</Box>
                    </>
                )}
            </Paper>

        </Box>
    );
};

export default SearchFilterBar;
